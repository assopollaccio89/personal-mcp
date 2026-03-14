import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { z } from "zod";
import { getGoogleAuthClient } from "./auth.js";
import { GoogleClient } from "./google-client.js";

const PORT = parseInt(process.env.PORT || "3003", 10);

async function startServer() {
  const auth = await getGoogleAuthClient();
  const client = new GoogleClient(auth);

  const server = new McpServer({
    name: "secretary-mcp",
    version: "1.0.0",
  });

  // --- Tools ---

  server.tool(
    "get-upcoming-events",
    "Lista i prossimi eventi dal calendario di Google.",
    { maxResults: z.number().min(1).max(50).default(10) },
    async ({ maxResults }) => {
      const events = await client.listUpcomingEvents(maxResults);
      return { content: [{ type: "text", text: JSON.stringify(events, null, 2) }] };
    }
  );

  server.tool(
    "get-unread-emails",
    "Lista le ultime email non lette da Gmail.",
    { maxResults: z.number().min(1).max(20).default(5) },
    async ({ maxResults }) => {
      const emails = await client.listUnreadEmails(maxResults);
      return { content: [{ type: "text", text: JSON.stringify(emails, null, 2) }] };
    }
  );

  server.tool(
    "search-emails",
    "Cerca email su Gmail usando query standard (es: 'from:amazon' o 'in:inbox project').",
    { query: z.string(), maxResults: z.number().min(1).max(20).default(5) },
    async ({ query, maxResults }) => {
      const emails = await client.searchEmails(query, maxResults);
      return { content: [{ type: "text", text: JSON.stringify(emails, null, 2) }] };
    }
  );

  // --- Transport Setup ---

  const sessions = new Map<string, any>();

  const httpServer = http.createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/mcp") {
      let body = "";
      req.on("data", (c) => (body += c));
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
  });

  httpServer.listen(PORT, () => {
    console.log(`[Secretary MCP] Running on http://localhost:${PORT}/mcp`);
  });
}

startServer().catch(console.error);
