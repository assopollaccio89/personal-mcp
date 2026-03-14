import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { z } from "zod";
import { WalletApiClient } from "./api-client.js";

// --- Config ---

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 min inattività
const MAX_SESSIONS = 5;
const token = process.env.WALLET_API_TOKEN;

if (!token) {
  process.stderr.write(
    "ERROR: WALLET_API_TOKEN environment variable is required.\n" +
      "Generate it from Wallet web app: Settings > API > Generate Token\n"
  );
  process.exit(1);
}

const client = new WalletApiClient(token);

// --- Session Management ---

interface Session {
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
}

const sessions = new Map<string, Session>();

// Cleanup sessioni zombie ogni 5 minuti
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
      process.stderr.write(`Session ${id} expired, cleaning up\n`);
      session.transport.close();
      sessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

// --- MCP Server Factory ---

function createServer(): McpServer {
  const server = new McpServer({
    name: "wallet-budgetbakers",
    version: "1.0.0",
  });
  registerTools(server);
  return server;
}

function registerTools(server: McpServer): void {

// Parametri paginazione comuni
const paginationSchema = {
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(30)
    .describe("Items per page (1-100, default 30)"),
  offset: z
    .number()
    .min(0)
    .default(0)
    .describe("Items to skip for pagination"),
};

// Helper: converte parametri in query string params
function toQueryParams(
  params: Record<string, unknown>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      result[key] = String(value);
    }
  }
  return result;
}

// Helper: wrappa la chiamata API in un tool result MCP
async function callApi(
  fn: () => Promise<{ data: unknown; rateLimitRemaining?: number }>
) {
  try {
    const { data, rateLimitRemaining } = await fn();
    const text =
      JSON.stringify(data, null, 2) +
      (rateLimitRemaining !== undefined
        ? `\n\n[API quota remaining: ${rateLimitRemaining}/500 requests per hour]`
        : "");
    return { content: [{ type: "text" as const, text }] };
  } catch (error) {
    return {
      content: [
        { type: "text" as const, text: `Error: ${(error as Error).message}` },
      ],
      isError: true,
    };
  }
}

// --- Tools ---

server.tool(
  "get-records",
  "Retrieve financial transactions from Wallet. " +
    "Filter by date, amount, category, account. " +
    "Use filter prefixes: eq., contains., contains-i., gt., gte., lt., lte. " +
    "Example: recordDate=gte.2026-01-01",
  {
    ...paginationSchema,
    accountId: z.string().optional().describe("Filter by account ID"),
    categoryId: z.string().optional().describe("Filter by category ID"),
    recordDate: z
      .string()
      .optional()
      .describe("Filter by date (e.g. gte.2026-01-01, lte.2026-02-28)"),
    amount: z
      .string()
      .optional()
      .describe("Filter by amount (e.g. gte.100, lt.50)"),
    payee: z
      .string()
      .optional()
      .describe("Filter by payee (e.g. eq.Amazon, contains-i.shop)"),
    note: z
      .string()
      .optional()
      .describe("Filter by note (e.g. contains-i.grocery)"),
    agentHints: z
      .boolean()
      .default(true)
      .describe("Include pagination/rate-limit advisory metadata"),
  },
  async (params) =>
    callApi(() => client.getRecords(toQueryParams(params)))
);

server.tool(
  "get-record-by-id",
  "Get a specific transaction by its ID.",
  {
    id: z.string().describe("The record/transaction ID"),
  },
  async ({ id }) => callApi(() => client.getRecordById(id))
);

server.tool(
  "get-accounts",
  "List all financial accounts (bank accounts, credit cards, cash, investments).",
  paginationSchema,
  async (params) =>
    callApi(() => client.getAccounts(toQueryParams(params)))
);

server.tool(
  "get-categories",
  "List transaction categories (income and expense).",
  {
    ...paginationSchema,
    customCategory: z
      .string()
      .optional()
      .describe("Filter: eq.true for custom only, eq.false for default only"),
  },
  async (params) =>
    callApi(() => client.getCategories(toQueryParams(params)))
);

server.tool(
  "get-budgets",
  "List budget definitions and their tracking status.",
  paginationSchema,
  async (params) =>
    callApi(() => client.getBudgets(toQueryParams(params)))
);

server.tool(
  "get-goals",
  "List savings goals and their progress.",
  paginationSchema,
  async (params) =>
    callApi(() => client.getGoals(toQueryParams(params)))
);

server.tool(
  "get-standing-orders",
  "List recurring transactions and subscriptions.",
  paginationSchema,
  async (params) =>
    callApi(() => client.getStandingOrders(toQueryParams(params)))
);

server.tool(
  "get-labels",
  "List transaction labels/tags.",
  paginationSchema,
  async (params) =>
    callApi(() => client.getLabels(toQueryParams(params)))
);

server.tool(
  "get-record-rules",
  "List auto-categorization rules for transactions.",
  paginationSchema,
  async (params) =>
    callApi(() => client.getRecordRules(toQueryParams(params)))
);

server.tool(
  "get-api-usage",
  "Check API usage stats and remaining quota. Call this before heavy operations.",
  {},
  async () => callApi(() => client.getApiUsage())
);
}

// --- HTTP Server ---

// Legge il body JSON dalla request
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function handleMcpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (req.method === "POST") {
    const bodyText = await readBody(req);
    const body = JSON.parse(bodyText);

    if (sessionId && sessions.has(sessionId)) {
      // Sessione esistente: inoltra al transport
      const session = sessions.get(sessionId)!;
      session.lastActivity = Date.now();
      await session.transport.handleRequest(req, res, body);
      return;
    }

    if (!sessionId && isInitializeRequest(body)) {
      // Nuova sessione: verifica cap
      if (sessions.size >= MAX_SESSIONS) {
        // Rimuovi la sessione più vecchia
        let oldest: [string, Session] | undefined;
        for (const entry of sessions) {
          if (!oldest || entry[1].lastActivity < oldest[1].lastActivity) {
            oldest = entry;
          }
        }
        if (oldest) {
          process.stderr.write(`Max sessions reached, evicting ${oldest[0]}\n`);
          oldest[1].transport.close();
          sessions.delete(oldest[0]);
        }
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          sessions.set(newSessionId, { transport, lastActivity: Date.now() });
          process.stderr.write(
            `Session ${newSessionId} created (active: ${sessions.size})\n`
          );
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && sessions.has(sid)) {
          sessions.delete(sid);
          process.stderr.write(
            `Session ${sid} closed (active: ${sessions.size})\n`
          );
        }
      };

      const server = createServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      return;
    }

    // Nessuna sessione valida
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session ID" },
        id: null,
      })
    );
    return;
  }

  if (req.method === "GET") {
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      session.lastActivity = Date.now();
      await session.transport.handleRequest(req, res);
      return;
    }
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid or missing session ID" }));
    return;
  }

  if (req.method === "DELETE") {
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res);
      return;
    }
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid or missing session ID" }));
    return;
  }

  res.writeHead(405, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Method not allowed" }));
}

const httpServer = http.createServer(async (req, res) => {
  // Health check
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        server: "wallet-budgetbakers-mcp",
        activeSessions: sessions.size,
      })
    );
    return;
  }

  // MCP endpoint
  if (req.url === "/mcp") {
    try {
      await handleMcpRequest(req, res);
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          })
        );
      }
    }
    return;
  }

  // Fallback
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      error: "Not found",
      endpoints: { mcp: "/mcp", health: "/health" },
    })
  );
});

httpServer.listen(PORT, () => {
  process.stderr.write(
    `Wallet BudgetBakers MCP server running on http://0.0.0.0:${PORT}\n` +
      `  MCP endpoint: http://0.0.0.0:${PORT}/mcp\n` +
      `  Health check: http://0.0.0.0:${PORT}/health\n`
  );
});
