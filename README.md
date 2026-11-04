# nio — Discord Bot

`nio` is a modern Discord server management ecosystem consisting of an administrative Next.js web dashboard, an orchestration NestJS bot controller, and high-performance Rust microservices communicating internally via low-latency gRPC APIs.

---

## Architecture Overview

The monorepo structure segregates concerns into web/bot platforms (`apps`) and optimized analytical decision engines (`services`).

```
                            +-----------------------------------+
                            |        Browser (Next.js)          |
                            |          [apps/client]            |
                            +-----------------+-----------------+
                                              |
                                              | REST API / HTTP
                                              v
+------------------+        +-----------------+-----------------+
|   Discord API    |<======>|   NestJS Orchestrator (Bot)       |
+------------------+        |          [apps/server]            |
                            +--------+------------------+-------+
                                     |                  |
                       gRPC (50051)  |                  | gRPC (3003)
                                     v                  v
                            +--------+--------+   +-----+-----------+
                            | Anomaly Engine  |   | Slowmode Engine |
                            | [services/...]  |   | [services/...]  |
                            +-----------------+   +-----------------+
```

### Monorepo Structure

- **`apps/client`**: A Next.js (React + Tailwind CSS) dashboard enabling server administrators to configure guild options, review audit logs, and build dynamic self-role reaction panels.
- **`apps/server`**: The central NestJS (TypeScript) orchestration engine. It manages live Gateway connections via `discord.js`, processes database persistence via Prisma ORM, and acts as the gRPC client to downstream services.
- **`services/slowmode-engine`**: A Rust HTTP service that maintains in-memory message rate histories to calculate dynamic channel slowmode levels (*Sepi*, *Sedang*, *Rame*).
- **`services/anomaly-engine`**: A high-performance Rust gRPC microservice that performs real-time message heuristics to detect phishing links, content abuse, and baseline traffic anomalies.

---

## Prerequisites & Installation

To run this repository locally, you will need:

- **Runtime**: [Bun](https://bun.sh/) (for JavaScript/TypeScript applications)
- **Rust Toolchain**: [Rustup & Cargo](https://rustup.rs/) (latest stable release)
- **Database**: PostgreSQL
- **Proto Compilations**: `protoc` (Protocol Buffer Compiler) installed on your system path (required for Rust `tonic-build` compilation).

---

## Getting Started

### 1. Environment Configurations

Create a `.env` configuration file in `apps/server/.env` and set the following parameters:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/nio_db"
DISCORD_BOT_TOKEN="your_discord_bot_token"
DISCORD_CLIENT_ID="your_discord_client_id"
DISCORD_CLIENT_SECRET="your_discord_client_secret"
SLOWMODE_ENGINE_URL="http://127.0.0.1:3003"
ANOMALY_ENGINE_URL="127.0.0.1:50051"
```

### 2. Database Migrations

Generate your local client and run Prisma migrations.

#### Fresh Database Setup
For a new database, apply the baseline and all incremental migrations:
```bash
cd apps/server
bun install
bun run prisma:generate
bun run prisma:deploy
```

#### Existing Database Rollout (from `db push` or pre-baseline state)
If transitioning an existing production database created before the migration baseline:
1. Back up your existing database (`pg_dump`).
2. Verify the schema matches `prisma/schema.prisma`.
3. Mark only the baseline migration as already applied:
   ```bash
   bunx prisma migrate resolve --applied 20260704000000_baseline
   ```
4. Deploy remaining incremental migrations:
   ```bash
   bun run prisma:deploy
   ```
*Never run `prisma migrate reset` or `db push` on production data.*

### 3. Redis & AI Agent Configuration

#### Redis Setup
Redis is required for AI agent conversational memory caching and degrades gracefully if unreachable:
```env
REDIS_URL="redis://localhost:6379"
```

#### Autonomous Discord AI Agent & MCP Configuration
The AI Agent operates on an autonomous multi-turn reasoning loop bounded by strict resource limits:
- Max Turns: 5
- Max Tool Calls Per Turn: 8
- Max Total Tool Calls: 20
- Max Wall-Clock Time: 60s
- Max Result Size: 32KB
- Repetition Detector: Terminates if the exact same tool call is repeated 3 times.

**AI Providers Supported**:
- `gemini`: Google Gemini (e.g. `gemini-2.5-flash`, `gemini-1.5-pro`) via `GEMINI_API_KEY`.
- `openai` / `openai-compatible`: Standard OpenAI (`gpt-4o`, `gpt-4o-mini`), OpenRouter, Groq, Ollama, LocalAI, etc. via `OPENAI_API_KEY` and optional `OPENAI_BASE_URL` (default `https://api.openai.com/v1`).

```env
DISCORD_AGENT_ENABLED=true
DISCORD_AGENT_PROVIDER=gemini        # 'gemini' | 'openai' | 'openai-compatible' | 'groq' | 'ollama'
DISCORD_AGENT_MODEL=gemini-2.5-flash # or 'gpt-4o-mini', 'llama-3.3-70b-versatile', etc.
GEMINI_API_KEY=
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
SEARXNG_URL=                         # Optional SearXNG instance for web_search
FIRECRAWL_URL=                       # Optional self-hosted Firecrawl instance for web_fetch (/v1/scrape) and web_search fallback (/v1/search)
FIRECRAWL_API_KEY=                   # Optional Firecrawl bearer token
```

**Public (`PUBLIC`) and Admin (`ADMIN`) Profile Separation**:
- NIO separates the guild AI agent into two fixed profiles inside the same bot:
  - **`PUBLIC` (Agent Umum)**: Member-facing conversational assistant (`/ai` and explicitly assigned member channels). Speaks naturally, uses English tool schemas/queries while preserving exact identifiers/URLs, and is strictly limited to safe public read tools (`get_server_rules`, `search_public_faq`, `web_search`, `web_fetch`).
  - **`ADMIN` (Agent Admin)**: Staff assistant for server administration and moderation (`/admin-ai`, ephemeral slash responses, and explicitly assigned staff channels).
- There is **no cross-profile fallback**: `/ai` never falls back to `ADMIN`, `/admin-ai` never falls back to `PUBLIC`, and unassigned or overlapping channels fail closed.
- **`ADMIN` Token Policy**: `ADMIN` uses `tokenQuotaMode = 'UNLIMITED'` (no NIO daily guild, role, personal, or per-run token caps) while continuing to track usage (`REPORTED`, `ESTIMATED`, `UNCERTAIN`) and enforcing finite `maxOutputTokens`, finite daily image quotas, concurrency leases, permissions, and human confirmation for mutations. Unlimited NIO token mode does not waive upstream AI provider billing.
- See [`apps/server/README.md`](apps/server/README.md#public-and-admin-ai-agent-profiles) for the migration and rollout runbook (`20261104020000_public_admin_agent_profiles`).

**Approval Semantics**:
- Read-only tools (`get_*`, `search_*`, `check_*`, etc.) execute autonomously to gather evidence.
- Mutating tools (moderation actions, roles, channel lockdowns, announcements, etc.) create interactive `AgentActionProposal` cards requiring moderator approval.
- Model Context Protocol (MCP) external tools are configured in operator deployment environment (`MCP_SERVERS_JSON`). Write operations with external side-effects strictly require the bot owner's approval (`OWNER_DISCORD_ID`).

### 4. Run Development Servers

Run the local development environments concurrently using the root `Makefile` helper targets:

```bash
# Start Next.js Dashboard UI (Port 3000)
make dev-client

# Start NestJS API & Bot Controller (Port 3002)
make dev-server

# Start Rust Dynamic Slowmode Engine (Port 3003)
make dev-slowmode

# Start Rust gRPC Anomaly Engine (Port 50051)
make dev-anomaly
```

---

## Service-to-Service gRPC Communications

All performance-critical internal interactions are routed through **gRPC (HTTP/2)** to minimize overhead. 

### Anomaly Engine gRPC Interface

Defined in `services/anomaly-engine/proto/anomaly/v1/anomaly.proto`:

```protobuf
service AnomalyEngine {
  rpc AnalyzeMessage(AnalyzeMessageRequest) returns (AnalyzeMessageResponse);
}
```

The NestJS orchestrator invokes the `AnalyzeMessage` RPC on every incoming Gateway message. A strict **200ms connection timeout** is enforced; if the Rust engine is unavailable, the bot degrades gracefully, allowing the message through and logging the failure.

---

## Monorepo Command Matrix (Makefile)

A master `Makefile` at the repository root delegates actions to individual sub-projects:

| Command | Action |
| --- | --- |
| `make dev-client` | Starts Next.js development server |
| `make dev-server` | Starts NestJS bot & API development watch mode |
| `make dev-slowmode` | Runs Rust slowmode engine locally |
| `make dev-anomaly` | Runs Rust gRPC anomaly engine locally |
| `make test` | Runs typechecks, unit tests (Jest), and Rust Cargo tests monorepo-wide |
| `make test-anomaly` | Runs gRPC anomaly integration tests |
| `make build-slowmode` | Compiles optimized release binary for the slowmode engine |
| `make build-anomaly` | Compiles optimized release binary for the anomaly engine |
| `make pull` | Pulls production images declared in `docker-compose.yml` |
| `make up` | Starts the production compose stack in detached mode |
| `make up-build` | Builds local images and starts the compose stack |
| `make down` | Stops the compose stack |
| `make restart` | Restarts the compose stack |
| `make logs` | Streams compose logs |
| `make ps` | Lists compose service status |

---

## Production Deployment

Create a root `.env` file from `.env.example` and set your GitHub Container Registry namespace:

```bash
cp .env.example .env
```

Example:

```env
GHCR_NAMESPACE=ghcr.io/lampu-hazard
IMAGE_TAG=latest
```

Then deploy the stack:

```bash
make pull
make up
```

The workflow pushes `nio-server` and `nio-client` to GHCR using `GITHUB_TOKEN` with `packages: write`. For private packages, authenticate Docker on the VPS with a token that has `read:packages` before pulling; no Docker Hub credentials are used.

If you want to build images directly on the server instead of pulling GHCR images:

```bash
make up-build
```

---

## Panel editor

Open a panel from the dashboard's Panels list. The workspace separates **Edit**, **Roles** (self-role only), and **Discord preview**; Edit groups **Content**, **Appearance**, and **Settings**. Simple mode uses native embed text; Canvas renders uploaded images, text, and shapes into a PNG while keeping Discord text/buttons separate. Save the draft before publishing. Image/artboard width is configurable; Discord's native embed width is not.

Apply the additive panel migration through the existing Prisma deploy script before serving the updated API. Missing `Panel.visualDocument` / `revision` columns prevent panel access; do not reset production or bypass revision checks. See [backend migration and rendering limits](apps/server/README.md#panel-visual-preview) and the [acceptance checklist](apps/client/scripts/panel-canvas-smoke.md).

Run `bun scripts/check-client.ts` and `bun scripts/sync-panel-visual.ts --check` at the repository root for client checks and shared-contract drift.

## Testing

To run the complete verification suite across all services:

```bash
make test
```

This sequentially runs `tsc --noEmit` on the client, unit tests with Jest on the server, and `cargo test` for all Rust microservices.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
