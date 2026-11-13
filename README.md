# NIO

Discord server management with a web dashboard, configurable automation, and separate member-facing and staff AI assistants.

NIO brings guild settings, moderation, self-role panels, media, voice activity, and AI access controls into one application. The Next.js dashboard talks to a NestJS API, which owns the Discord bot connection and persists application data in PostgreSQL.

## Features

- **Guild dashboard** — Discord OAuth sign-in, guild-scoped configuration, and an owner console with server-side authorization.
- **Moderation and automation** — moderation workflows, audit tools, and a native Rust Sentinel module for content analysis.
- **Panels and self-roles** — native Discord embeds and controls, plus a canvas editor for raster text, images, and shapes. Draft revisions protect against stale updates.
- **Media and integrations** — keyword-triggered stickers, S3-compatible storage, donation integrations, and configurable plugins.
- **Voice activity** — voice statistics, XP, cumulative level rewards, and independent activity and level-up notifications.
- **AI assistants** — independent PUBLIC and ADMIN profiles, channel routing, role-based access, usage accounting, image quotas, and confirmation gates for mutating tools.

## Architecture

```text
Browser
  │ same-origin /api requests
  ▼
Next.js dashboard ── HTTP ──► NestJS API / Discord bot ◄──► Discord
                                      │
                                      ├── PostgreSQL / Prisma
                                      ├── Redis conversation cache
                                      ├── Native Rust Sentinel module
                                      ├── S3-compatible object storage
                                      └── Optional AI, search, and MCP providers
```

| Path | Responsibility |
| --- | --- |
| [`apps/client`](apps/client) | Next.js App Router dashboard |
| [`apps/server`](apps/server) | NestJS API, Discord Gateway handling, and feature modules |
| [`apps/server/prisma`](apps/server/prisma) | Database schema and versioned migrations |
| [`services/sentinel`](services/sentinel) | Rust native module loaded by the backend |
| [`services/searxng`](services/searxng) | Search service configuration |
| [`scripts`](scripts) | Repository checks and shared-contract synchronization |
| [`docker-compose.yml`](docker-compose.yml) | Container services, dependencies, networking, and volumes |

The current Compose stack includes PostgreSQL, Redis, SearXNG, a one-shot migration service, the API, and the dashboard. It does not run the former standalone slowmode, anomaly, or analytics engines.

## Requirements

- [Bun](https://bun.sh/) for application dependencies, scripts, and runtime.
- PostgreSQL and Redis; the provided Compose configuration uses PostgreSQL 16 and Redis 7.
- A Discord application and bot, with credentials and Gateway intents appropriate to the enabled features. Keyword-based message handling requires Message Content Intent.
- Docker with Compose for container-based development or deployment.
- Stable Rust/Cargo when modifying or rebuilding Sentinel.
- Optional object storage and AI/search credentials for the features that use them.

A POSIX shell is used in the command examples. On Windows, use Git Bash, WSL, or equivalent PowerShell commands. GNU Make is optional; the app-level Bun scripts can be run directly.

## Local development

### 1. Configure the environment

Copy the example files only if the destination files do not already exist:

```sh
cp apps/server/.env.example apps/server/.env
cp .env.example .env
```

`apps/server/.env` is the backend environment file. The root `.env` supplies Compose interpolation, including image namespace and tag; it is not a replacement for the backend file.

At minimum, review:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection for the local API and Prisma commands |
| `REDIS_URL` | Redis connection |
| `PORT` | API listening port |
| `FRONTEND_URL` | Dashboard origin used for CORS and redirects |
| `BACKEND_URL` | API origin; also configures the dashboard proxy when set in the client process |
| `SESSION_SECRET` | Private, randomly generated session secret |
| `DISCORD_BOT_TOKEN` | Discord bot credential |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Discord OAuth application credentials |
| `DISCORD_REDIRECT_URI` | Callback registered in the Discord Developer Portal |
| `OWNER_DISCORD_ID` | Discord identity authorized for owner-only APIs |

For a consistent local setup, use API port `3002`, dashboard origin `http://localhost:3000`, and callback `http://localhost:3000/api/auth/discord/callback`. The backend example currently uses port `3001`; update its `PORT` and `BACKEND_URL` to `3002`, or explicitly set the dashboard process's `BACKEND_URL=http://localhost:3001` instead. The dashboard proxy defaults to port `3002`.

Browser requests should continue through the dashboard's same-origin `/api` proxy so the session cookie follows the request. Do not replace it with direct cross-origin API calls.

Keep real credentials in private environment files. Never commit bot tokens, OAuth secrets, database credentials, provider keys, or encryption keys.

### 2. Start infrastructure

```sh
docker compose up -d db redis
```

The supplied development defaults expose PostgreSQL on host port `5435` and Redis on `6379`. Use the matching connection strings in the backend environment. Start SearXNG separately when needed:

```sh
docker compose up -d searxng
```

SearXNG is reachable inside the Compose network at `http://searxng:8080`; it has no host port mapping by default. A host-run API needs a separately reachable instance or an intentional local port mapping.

### 3. Install dependencies and prepare a fresh database

Run each block from the repository root:

```sh
(cd apps/server && bun install && bun run prisma:generate && bun run prisma:deploy)
(cd apps/client && bun install)
```

These migration commands are appropriate for a fresh database or a database with reconciled migration history. For an existing installation, read [Database changes](#database-changes) first.

### 4. Start the applications

Use separate terminals:

```sh
make dev-server
make dev-client
```

Without Make, run `bun run dev` from the corresponding app directory. Open `http://localhost:3000` after both processes are ready.

## Feature configuration

### AI profiles

AI is disabled by default. Configure the provider and model in the backend environment and review each guild profile in the dashboard before enabling it.

- **PUBLIC** serves members through `/ai` and assigned channels, with a restricted public tool policy.
- **ADMIN** serves staff through `/admin-ai` and assigned staff channels. Slash responses are ephemeral.
- Profiles have independent credentials, channels, permissions, tools, usage, and conversation history. Unassigned or overlapping channel routing fails closed; there is no cross-profile fallback.
- Mutating tools require confirmation. External MCP write operations require owner approval. A hidden UI route is not an authorization boundary.
- Unlimited ADMIN token policy removes NIO token quotas, not provider charges, output limits, image quotas, permissions, or execution deadlines.

The runtime supports Gemini and OpenAI-compatible providers. Search uses SearXNG, with Firecrawl Cloud fallback for supported failure/empty-result cases; page fetching uses Firecrawl. `FIRECRAWL_URL` defaults to `https://api.firecrawl.dev`. Set `FIRECRAWL_API_KEY` privately; provider credits and billing apply.

See the [backend AI profile runbook](apps/server/README.md#public-and-admin-ai-agent-profiles) for access rules, accounting, migration behavior, and rollout requirements. Consult the backend implementation and runbook for execution limits rather than treating model prompts as enforcement.

### Voice activity

Enable Voice XP and configure rewards in guild settings. Eligible humans earn XP with another eligible human or a bot companion in a regular voice channel. Bots do not earn XP or rewards. Alone, AFK, stage, muted, and deafened human sessions do not qualify.

Activity logs store escaped channel names as text, so new notifications remain readable after a channel is deleted. A bounded in-memory snapshot can recover recently observed names during a leave event. When no name is available, the log says `Channel tidak tersedia`. Existing Discord messages are not rewritten, and snapshots do not survive a bot restart.

See [voice XP and notifications](apps/server/README.md#voice-xp-and-notifications) for migration, permissions, and single-gateway-owner requirements.

### Panels and media

The editor separates content, appearance, roles, and Discord preview. Simple mode uses native embeds. Canvas exports uploaded images, text, and shapes to PNG while leaving Discord buttons and other controls native. Save a draft before publishing.

Configure the `R2_*` variables for storage-backed media. Canvas assets must use the current guild's upload namespace and pass the backend's format, size, and rendering checks. See [panel rendering limits](apps/server/README.md#panel-visual-preview) and the [canvas acceptance checklist](apps/client/scripts/panel-canvas-smoke.md).

## Development commands

| Command | Scope |
| --- | --- |
| `make dev-client` | Start the dashboard |
| `make dev-server` | Start the API and bot in watch mode |
| `make test` | Panel contract drift check, client typecheck, and server Jest suite |
| `make build-server` | Generate Prisma Client and build the backend |
| `bun scripts/check-client.ts` | Run the repository's client checks |
| `bun scripts/sync-panel-visual.ts --check` | Verify the shared panel visual contract |
| `make pull` | Pull configured Compose images |
| `make up` / `make up-build` | Start pulled images / build and start local images |
| `make logs` / `make ps` | Inspect Compose logs / service status |
| `make down` | Stop the Compose stack without removing named volumes |

App-level checks, from the repository root:

```sh
(cd apps/client && bun run typecheck && bun run lint && bun run build)
(cd apps/server && bun run lint && bun run test -- --runInBand && bun run build)
```

Run a focused backend test:

```sh
(cd apps/server && bun run test -- --runInBand src/discord/voice-activity.service.spec.ts)
```

`lint` currently runs TypeScript checks in both apps; it is not a separate style linter. `make test` does not run production builds, Rust tests, browser acceptance, or live Discord/provider tests. For Sentinel changes, run `cargo test` from `services/sentinel`. Database integration tests require a dedicated disposable database; never point them at production.

## Database changes

Prisma migrations are versioned in `apps/server/prisma/migrations`. Before changing an existing database:

1. Confirm the intended database and take a restorable backup.
2. Inspect migration status and compare the actual schema with the migration history.
3. For a pre-migration or schema-pushed installation, reconcile the baseline and any already-present incremental changes with an operator. Do not mark a migration applied merely because tables exist.
4. Drain incompatible workers when the release's runbook requires it.
5. Apply reviewed migrations through `bun run prisma:deploy` from `apps/server`, then start compatible workers.

Never run `prisma migrate reset` or `prisma db push` against production data. A missing-column error usually means the deployed application and database schema are out of sync; resetting the database is not a repair strategy.

The Compose `nio-migrate` service applies migrations before `nio-server` starts. Starting the full stack is therefore a database-changing operation, not just an application restart.

## Production deployment

The [deployment workflow](.github/workflows/deploy.yml) builds server and client images, publishes them to GHCR, and deploys the Compose stack over SSH on pushes to `main` or manual invocation. Treat a normal push to `main` as a deployment trigger.

Configure the workflow's VPS connection secrets and project path, package access, private server environment, and root Compose environment before enabling deployment. Use a commit-SHA image tag for reproducible releases. Private GHCR packages require registry authentication on the deployment host.

On an already prepared deployment host, after backup and migration review:

```sh
make pull
make up
make ps
make logs
```

`make up-build` builds locally instead of pulling images. Database rollback requires a separate reviewed plan; switching an image tag does not reverse migrations or external actions.

### Production hardening

The Compose file contains development database credentials and publishes database, cache, API, and dashboard ports. Before exposing a deployment:

- Replace development credentials and align the database URL override with the database service configuration.
- Restrict database/cache ports to trusted interfaces or remove host publishing; the default Redis service has no authentication.
- Terminate HTTPS at a trusted reverse proxy and configure origins, OAuth callback, cookies, and proxy handling for that topology.
- Keep PostgreSQL backups off-host and test restoration.
- Grant only the Discord permissions needed by enabled features.
- Review third-party providers and MCP servers as separate trust and billing boundaries.

## Further documentation

- [Backend modules, feature runbooks, and limits](apps/server/README.md)
- [Client verification script](scripts/check-client.ts)
- [Panel contract synchronization](scripts/sync-panel-visual.ts)
- [Compose service configuration](docker-compose.yml)
- [Build and deployment workflow](.github/workflows/deploy.yml)
