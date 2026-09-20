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
```

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

Create a root `.env` file from `.env.example` and set your Docker Hub namespace:

```bash
cp .env.example .env
```

Example:

```env
DOCKERHUB_NAMESPACE=your-dockerhub-username
IMAGE_TAG=latest
```

Then deploy the stack:

```bash
make pull
make up
```

If you want to build images directly on the server instead of pulling Docker Hub images:

```bash
make up-build
```

---

## Testing

To run the complete verification suite across all services:

```bash
make test
```

This sequentially runs `tsc --noEmit` on the client, unit tests with Jest on the server, and `cargo test` for all Rust microservices.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
