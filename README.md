# personal-mcp — MCP Server Personali

Monorepo dei Model Context Protocol server per uso personale.
Repo GitHub: [`assopollaccio89/personal-mcp`](https://github.com/assopollaccio89/personal-mcp)

---

## Server

| Servizio | Porta | Descrizione |
|----------|-------|-------------|
| `wallet-budgetbakers` | 3000 | Finanze personali via BudgetBakers API (10 tool read-only) |
| `weather-mcp` | 3001 | Previsioni meteo (OpenMeteo) |
| `health-mcp` | 3002 | Dati fitness (open-wearables) |
| `secretary-mcp` | 3003 | Gmail e Google Calendar |
| `nutrition-mcp` | 3004 | Gestione alimentazione |

---

## Deploy (NAS — Produzione)

```bash
# Prerequisiti: directory /share/Container/.../application/personal-mcp/ con env files
# Vedi CLAUDE.md di ogni server per i file env richiesti

docker compose -f /path/to/personal-mcp/docker-compose.yml up -d
```

Le immagini vengono pubblicate su GHCR dalla CI/CD:
`ghcr.io/assopollaccio89/personal-mcp-{service}:main`

---

## Sviluppo Locale

```bash
# Avvia tutti i server con build locale e bridge networking
docker compose up --build

# Oppure un singolo server
docker compose up --build weather-mcp
```

---

## Struttura

```
mcp-servers/
├── docker-compose.yml          # Produzione NAS (immagini GHCR, host network)
├── docker-compose.override.yml # Dev locale (build context, bridge, porte esposte)
├── .github/workflows/
│   └── docker-publish.yml      # CI/CD: build e push su GHCR
├── wallet-budgetbakers/        # BudgetBakers MCP server
├── weather-mcp/
├── health-mcp/
├── secretary-mcp/
└── nutrition-mcp/
```
