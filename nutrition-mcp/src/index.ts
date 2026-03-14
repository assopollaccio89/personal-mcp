import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { z } from "zod";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const PORT = parseInt(process.env.PORT ?? "3004", 10);

// --- Database Setup ---
const dbPath = process.env.DATABASE_PATH || "./data/nutrition.db";
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT DEFAULT (datetime('now', 'localtime')),
    name TEXT NOT NULL,
    calories REAL,
    protein REAL,
    carbs REAL,
    fat REAL,
    type TEXT -- colazione, pranzo, cena, snack
  )
`);

// --- MCP Server ---
const server = new McpServer({
  name: "nutrition-mcp",
  version: "1.0.0",
});

// --- Tools ---

server.tool(
  "log_meal",
  "Registra un pasto nel diario alimentare",
  {
    name: z.string().describe("Nome del piatto o alimento"),
    calories: z.number().describe("Calorie stimate"),
    protein: z.number().optional().default(0).describe("Proteine in grammi"),
    carbs: z.number().optional().default(0).describe("Carboidrati in grammi"),
    fat: z.number().optional().default(0).describe("Grassi in grammi"),
    type: z.enum(["colazione", "pranzo", "cena", "snack"]).optional().default("pranzo"),
  },
  async ({ name, calories, protein, carbs, fat, type }) => {
    const stmt = db.prepare(
      "INSERT INTO meals (name, calories, protein, carbs, fat, type) VALUES (?, ?, ?, ?, ?, ?)"
    );
    stmt.run(name, calories, protein, carbs, fat, type);
    return {
      content: [{ type: "text", text: `✅ Pasto registrato: ${name} (${calories} kcal)` }],
    };
  }
);

server.tool(
  "get_daily_summary",
  "Ottieni il riepilogo nutrizionale per una data specifica",
  {
    date: z.string().optional().describe("Data in formato YYYY-MM-DD (default oggi)"),
  },
  async ({ date }) => {
    const targetDate = date || new Date().toISOString().split("T")[0];
    const rows = db.prepare("SELECT * FROM meals WHERE date LIKE ?").all(`${targetDate}%`);
    
    const total = rows.reduce(
      (acc: any, row: any) => ({
        calories: acc.calories + row.calories,
        protein: acc.protein + row.protein,
        carbs: acc.carbs + row.carbs,
        fat: acc.fat + row.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 } as any
    );

    return {
      content: [
        {
          type: "text",
          text: `Riepilogo del ${targetDate}:\n🔥 Calorie: ${total.calories.toFixed(2)} kcal\n🥩 Proteine: ${total.protein.toFixed(2)}g\n🍝 Carboidrati: ${total.carbs.toFixed(2)}g\n🥑 Grassi: ${total.fat.toFixed(2)}g`,
        },
      ],
    };
  }
);

server.tool(
  "suggest_recovery_meal",
  "Suggerisce un pasto ideale basato sull'attività fisica svolta",
  {
    activity_type: z.string().describe("Tipo di attività (es. ciclismo, yoga, trekking)"),
    intensity: z.enum(["bassa", "media", "alta"]).optional().default("media"),
  },
  async ({ activity_type }) => {
    let suggestion = "";
    const act = activity_type.toLowerCase();

    if (act.includes("ciclismo")) {
      suggestion = "Hai bisogno di ricaricare il glicogeno: Pasta integrale con tonno e pomodorini + una banana.";
    } else if (act.includes("yoga")) {
      suggestion = "Focus su idratazione e leggerezza: Hummus di ceci con verdure e yogurt greco.";
    } else if (act.includes("trekking")) {
      suggestion = "Mix bilanciato macro: Riso basmati con pollo, avocado e frutta secca.";
    } else {
      suggestion = "Pasto bilanciato standard: Quinoa con verdure e uova sode.";
    }

    return {
      content: [{ type: "text", text: `💡 Suggerimento post-${activity_type}: ${suggestion}` }],
    };
  }
);

server.tool(
  "generate_shopping_list",
  "Genera una lista della spesa basata su un piano alimentare o ricette",
  {
    meals_plan: z.string().describe("Descrizione dei pasti previsti (es. cena per 3 giorni)"),
    budget_limit: z.number().optional().describe("Budget massimo opzionale in EUR"),
  },
  async ({ meals_plan, budget_limit }) => {
    const list = `Lista spesa per: ${meals_plan}\n- Ingredienti base (riso/pasta/pollo)\n- Verdure di stagione\n- Frutta fresca\n- Yogurt greco\n${budget_limit ? `⚠️ Target budget: ${budget_limit} EUR` : ""}`;
    
    return {
      content: [{ type: "text", text: `🛒 **Lista della Spesa Generata**\n\n${list}` }],
    };
  }
);

// --- HTTP Transport Setup (Standard MCP over SSE) ---

const sessions = new Map<string, any>();

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.method === "POST" && req.url === "/mcp") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
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
      } catch (err) {
        console.error("Error parsing JSON:", err);
        res.writeHead(400);
        res.end("Invalid JSON");
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
  console.log(`[Nutrition MCP] Running on http://localhost:${PORT}/mcp`);
});
