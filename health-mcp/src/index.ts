import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { z } from "zod";
import { HealthApiClient } from "./api-client.js";

const PORT = parseInt(process.env.PORT ?? "3002", 10);
const client = new HealthApiClient();

// --- MCP Server ---

const server = new McpServer({
  name: "health-mcp",
  version: "1.0.0",
});

// Helper for date validation
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Data in formato YYYY-MM-DD");

// Helper: wrap call
async function callHealthApi(fn: () => Promise<any>) {
  try {
    const data = await fn();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Errore Health API: ${(error as Error).message}` }],
      isError: true,
    };
  }
}

server.tool(
  "get-daily-health-summary",
  "Ottieni riepilogo giornaliero fitness: passi, calorie, minuti attivi.",
  { date: dateSchema },
  async ({ date }) => callHealthApi(() => client.getDailySummary(date))
);

server.tool(
  "get-heart-rate",
  "Ottieni dati frequenza cardiaca (attuale e a riposo) per una data.",
  { date: dateSchema },
  async ({ date }) => callHealthApi(() => client.getHeartRate(date))
);

server.tool(
  "get-sleep-data",
  "Ottieni dati sul sonno: durata, fasi e qualità.",
  { date: dateSchema },
  async ({ date }) => callHealthApi(() => client.getSleep(date))
);

server.tool(
  "get-fitness-activities",
  "Elenco delle ultime attività sportive registrate (nuoto, ciclismo, corsa).",
  { limit: z.number().min(1).max(20).default(5).describe("Numero massimo di attività da restituire") },
  async ({ limit }) => callHealthApi(() => client.getActivities(limit))
);

server.tool(
  "get-body-metrics",
  "Ottieni ultime misurazioni corporee (peso, composizione corporea).",
  {},
  async () => callHealthApi(() => client.getBodyMetrics())
);

// --- HTTP Transport Setup (Standard MCP over SSE) ---

const sessions = new Map<string, any>();

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.method === "POST" && req.url === "/mcp") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      const json = JSON.parse(body);
      if (isInitializeRequest(json)) {
        let transport: StreamableHTTPServerTransport;
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => { sessions.set(id, { transport }); },
        });
        transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
        await server.connect(transport);
        await transport.handleRequest(req, res, json);
      } else {
        const sid = req.headers["mcp-session-id"] as string;
        const session = sessions.get(sid);
        if (session) await session.transport.handleRequest(req, res, json);
        else { res.writeHead(400); res.end("No session"); }
      }
    });
    return;
  }
  
  if (req.method === "GET" && req.url === "/mcp") {
    const sid = req.headers["mcp-session-id"] as string;
    const session = sessions.get(sid);
    if (session) await session.transport.handleRequest(req, res);
    else { res.writeHead(400); res.end("No session"); }
    return;
  }

  res.writeHead(404);
  res.end();
}

const httpServer = http.createServer(handleRequest);

httpServer.listen(PORT, () => {
  console.log(`[Health MCP] Running on http://localhost:${PORT}/mcp`);
});
