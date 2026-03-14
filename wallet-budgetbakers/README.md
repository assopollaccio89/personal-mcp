# Wallet BudgetBakers MCP Server

MCP server per accedere ai dati finanziari di [Wallet by BudgetBakers](https://budgetbakers.com) da Claude Code (o qualsiasi client MCP).

## Cosa fa

Espone 10 tools **read-only** che interrogano la REST API di Wallet:

| Tool | Descrizione |
|------|-------------|
| `get-records` | Transazioni con filtri per data, importo, categoria, payee |
| `get-record-by-id` | Singola transazione per ID |
| `get-accounts` | Conti bancari, carte, contanti, investimenti |
| `get-categories` | Categorie transazioni (entrate e uscite) |
| `get-budgets` | Budget e stato di avanzamento |
| `get-goals` | Obiettivi di risparmio e progresso |
| `get-standing-orders` | Transazioni ricorrenti e abbonamenti |
| `get-labels` | Etichette/tag per transazioni |
| `get-record-rules` | Regole di auto-categorizzazione |
| `get-api-usage` | Statistiche uso API e quota rimanente |

## Come funziona

```
Claude Code ──HTTP──> MCP Server (porta 3000) ──HTTPS──> BudgetBakers REST API
                      /mcp    (MCP protocol)
                      /health (healthcheck)
```

- **Transport**: Streamable HTTP (stateless) sulla porta 3000
- **Autenticazione**: Bearer token JWT passato come variabile d'ambiente `WALLET_API_TOKEN`
- **Rate limit**: 500 richieste/ora (gestito con errori informativi)
- **Filtri**: Supporta prefissi `eq.`, `contains.`, `contains-i.`, `gt.`, `gte.`, `lt.`, `lte.`

## Prerequisiti

- **Node.js 22+** (per build locale) oppure **Docker** (per deploy container)
- **Wallet Premium** - l'API REST richiede un abbonamento Premium
- **Token API** - generato dalla web app Wallet: Settings > API > Generate Token

## Installazione

### Opzione A: Docker su NAS (Consigliata)

Questo server è parte del monorepo [`assopollaccio89/personal-mcp`](https://github.com/assopollaccio89/personal-mcp).
Le immagini vengono pubblicate su GHCR dalla CI/CD del monorepo.

1. Crea il file env sul NAS:
   ```bash
   # /share/Container/container-station-data/application/personal-mcp/wallet-budgetbakers.env
   WALLET_API_TOKEN=il-tuo-token
   ```

2. Avvia con lo stack personal-mcp:
   ```bash
   docker compose -f /path/to/personal-mcp/docker-compose.yml up -d wallet-budgetbakers
   ```

3. Verifica:
   ```bash
   curl http://localhost:3000/health
   # {"status":"ok","server":"wallet-budgetbakers-mcp"}
   ```

### Opzione B: Node.js locale

1. Installa dipendenze e compila:
   ```bash
   npm install
   npm run build
   ```

2. Avvia con il token:
   ```bash
   # Linux/macOS
   WALLET_API_TOKEN=il-tuo-token node dist/index.js

   # Windows (cmd)
   set WALLET_API_TOKEN=il-tuo-token && node dist/index.js

   # Windows (PowerShell)
   $env:WALLET_API_TOKEN="il-tuo-token"; node dist/index.js
   ```

### Opzione C: Sviluppo (senza build)

```bash
npm install
WALLET_API_TOKEN=il-tuo-token npm run dev
```

## Configurazione Claude Code

### Server remoto (Docker su NAS/server)

```bash
claude mcp add-json wallet-budgetbakers "{\"type\":\"http\",\"url\":\"http://<hostname>:3000/mcp\"}" --scope user
```

### Server locale (Node.js)

```bash
claude mcp add-json wallet-budgetbakers "{\"type\":\"stdio\",\"command\":\"cmd\",\"args\":[\"/c\",\"node\",\"<path>\\\\dist\\\\index.js\"],\"env\":{\"WALLET_API_TOKEN\":\"<token>\"}}" --scope user
```

Verifica con `/mcp` in Claude Code.

## Esempi d'uso in Claude Code

```
"Mostra i miei conti Wallet"
"Quali sono le ultime 10 transazioni?"
"Mostra le spese di gennaio 2026 sopra i 100 euro"
"Quanto ho speso nella categoria Alimentari questo mese?"
"Controlla la quota API rimanente"
```

## Filtri avanzati

I tools che supportano filtri usano la sintassi dell'API BudgetBakers:

| Prefisso | Significato | Esempio |
|----------|-------------|---------|
| `eq.` | Uguale | `payee=eq.Amazon` |
| `contains.` | Contiene (case-sensitive) | `note=contains.Bill` |
| `contains-i.` | Contiene (case-insensitive) | `note=contains-i.spesa` |
| `gt.` | Maggiore di | `amount=gt.100` |
| `gte.` | Maggiore o uguale | `recordDate=gte.2026-01-01` |
| `lt.` | Minore di | `amount=lt.50` |
| `lte.` | Minore o uguale | `recordDate=lte.2026-02-28` |

## Sicurezza

- Il token JWT **non viene mai** salvato nel codice sorgente
- Il file `.env` è nel `.gitignore`
- Il server espone solo endpoint read-only
- In ambiente Docker, il token è passato come variabile d'ambiente del container
- L'endpoint `/health` non richiede autenticazione (usato per healthcheck)

## Struttura progetto

```
wallet-budgetbakers/
├── Dockerfile            # Immagine Docker (Node 22 Alpine)
├── docker-compose.yml    # Orchestrazione con healthcheck
├── package.json          # Dipendenze e script
├── tsconfig.json         # Config TypeScript
├── .env.example          # Template variabili d'ambiente
├── .gitignore            # Esclusioni git
├── .dockerignore         # Esclusioni Docker build
├── src/
│   ├── index.ts          # Server MCP + HTTP + 10 tools
│   └── api-client.ts     # Client HTTP per BudgetBakers API
└── dist/                 # Output compilato (gitignored)
```

## Troubleshooting

| Errore | Causa | Soluzione |
|--------|-------|-----------|
| `Authentication failed` | Token scaduto o invalido | Rigenera da Wallet: Settings > API |
| `Rate limit exceeded` | Superati 500 req/hr | Attendi il reset (vedi header Retry-After) |
| `Data sync in progress` | BudgetBakers sta sincronizzando | Riprova tra qualche secondo |
| `WALLET_API_TOKEN required` | Variabile d'ambiente mancante | Imposta `WALLET_API_TOKEN` nel `.env` o nell'ambiente |
