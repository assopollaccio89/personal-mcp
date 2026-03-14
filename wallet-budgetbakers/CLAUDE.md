# CLAUDE.md — wallet-budgetbakers

> Contesto di progetto per sessioni Claude Code. Aggiornare a fine sessione con skill `revise-claude-md`.

## Struttura progetto

```
src/
  index.ts        # Entry point MCP server (HTTP, porta 3000)
  api-client.ts   # Client REST BudgetBakers API
Dockerfile        # Build image Node 22 Alpine
docker-compose.yml  # Compose locale (dev standalone)
```

## Comandi

```bash
npm run dev       # Avvio locale con tsx (no build)
npm run build     # Compila TypeScript → dist/
npm start         # Avvia dist/index.js
```

## Variabili d'ambiente

| Variabile | Descrizione |
|-----------|-------------|
| `WALLET_API_TOKEN` | JWT BudgetBakers (scade ogni 7gg — skill `token-renew`) |

## Deploy NAS

Parte dello stack **personal-mcp**:
- Compose: `/share/Container/container-station-data/application/personal-mcp/docker-compose.yml`
- Env file: `/share/Container/container-station-data/application/personal-mcp/wallet-budgetbakers.env`
- Container name: `wallet-mcp`
- Porta: 3000

```bash
# Restart container
ssh paolo@nas82cf76 "/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker compose \
  -f /share/Container/container-station-data/application/personal-mcp/docker-compose.yml restart wallet-budgetbakers"
```

## Metadati

- **project_name**: wallet-budgetbakers
- **project_type**: MCP server
- **repo**: `assopollaccio89/personal-mcp` (monorepo con weather, health, secretary, nutrition)
- **immagine GHCR**: `ghcr.io/assopollaccio89/personal-mcp-wallet-budgetbakers:main`

## Decisioni di Sessione

| Data | Decisione | Motivazione |
|------|-----------|-------------|
| 2026-02-21 | Stack: TypeScript + MCP SDK, HTTP/3000, 10 tool read-only, Docker NAS | Sicurezza (no write), deploy permanente |
| 2026-03-06 | Refactor: sync in progetto, CSV in Data/, segreti in .env NAS, skill /wallet | Coesione, sicurezza, ergonomia Claude |
| 2026-03-14 | Migrato in monorepo `personal-mcp` via `git subtree add` | Infrastruttura condivisa tra agenti — wallet è MCP server personale come gli altri |

## Workaround Noti

| Problema | Workaround |
|----------|------------|
| API `get-records` restituisce dati in finestre temporali limitate | Doppio loop: esterno sulle finestre (`recordDateRange`), interno su offset. Vedi `wallet_sync.js` (non in git — ricreare se necessario) |
| Risposte MCP contengono JSON + metadata quota in coda | Parsing: `text.split("[API quota")[0].trim()` prima di `JSON.parse` |
| Token JWT BudgetBakers scade ogni 7 giorni | Rinnovo manuale: Settings > API > Generate Token, aggiornare env file su NAS, restart container |
| `docker` non nel PATH su QNAP via SSH | Usare path completo: `/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker` |
| Sessione MCP Claude Code si invalida dopo restart container | Riavviare Claude Code per ristabilire la connessione |

## Note per le Prossime Sessioni

- `wallet_sync.js` non è tracciato in git (era gitignored nel repo originale) — ricreare se serve sync CSV
- Token API in env file NAS, mai nel codice
- Endpoint Claude Code MCP invariato: `http://nas82cf76:3000/mcp`
