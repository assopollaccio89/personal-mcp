import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { z } from "zod";
import { WeatherApiClient } from "./api-client.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const client = new WeatherApiClient();

// --- MCP Server ---

const server = new McpServer({
  name: "weather-mcp",
  version: "1.0.0",
});

// Helper: weather code to text
function weatherCodeToText(code: number): string {
  const codes: Record<number, string> = {
    0: "Sereno",
    1: "Prevalentemente sereno",
    2: "Parzialmente nuvoloso",
    3: "Nuvoloso",
    45: "Nebbia",
    48: "Nebbia brinata",
    51: "Pioggerella leggera",
    53: "Pioggerella moderata",
    55: "Pioggerella densa",
    61: "Pioggia debole",
    63: "Pioggia moderata",
    65: "Pioggia forte",
    71: "Neve debole",
    73: "Neve moderata",
    75: "Neve forte",
    80: "Rovesci di pioggia deboli",
    81: "Rovesci di pioggia moderati",
    82: "Rovesci di pioggia violenti",
    95: "Temporale",
  };
  return codes[code] || "Sconosciuto";
}

server.tool(
  "get-weather",
  "Ottieni il meteo attuale per una specifica città.",
  {
    city: z.string().describe("Nome della città (es. Milano, Roma, Londra)"),
  },
  async ({ city }) => {
    try {
      const geo = await client.geocode(city);
      const data = await client.getForecast(geo.latitude, geo.longitude, 1);
      
      const current = data.current;
      const response = {
        location: `${geo.name}, ${geo.country}`,
        condition: weatherCodeToText(current.weather_code),
        temp: `${current.temperature_2m}°C`,
        feels_like: `${current.apparent_temperature}°C`,
        humidity: `${current.relative_humidity_2m}%`,
        wind: `${current.wind_speed_10m} km/h`,
        time: data.current.time
      };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Errore: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get-forecast",
  "Ottieni le previsioni meteo per i prossimi giorni per una città.",
  {
    city: z.string().describe("Nome della città"),
    days: z.number().min(1).max(7).default(3).describe("Numero di giorni di previsione (1-7)"),
  },
  async ({ city, days }) => {
    try {
      const geo = await client.geocode(city);
      const data = await client.getForecast(geo.latitude, geo.longitude, days);
      
      const daily = data.daily;
      const forecasts = daily.time.map((time: string, i: number) => ({
        date: time,
        condition: weatherCodeToText(daily.weather_code[i]),
        max_temp: `${daily.temperature_2m_max[i]}°C`,
        min_temp: `${daily.temperature_2m_min[i]}°C`,
        precipitation: `${daily.precipitation_sum[i]} mm`,
        uv_index: daily.uv_index_max[i],
      }));

      const response = {
        location: `${geo.name}, ${geo.country}`,
        forecasts,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Errore: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
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
  console.log(`[Weather MCP] Running on http://localhost:${PORT}/mcp`);
});
