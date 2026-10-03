# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository shape

This is a Bun/TypeScript and Rust monorepo for the NIO Discord bot and management dashboard:

- `apps/client` is the Next.js App Router frontend. It calls the Nest API through the same-origin `/api` rewrite in `next.config.ts`; `lib/api.ts` handles browser and server-side requests and forwards the session cookie on server-rendered requests.
- `apps/server` is a modular NestJS API and Discord bot orchestrator. Feature modules under `src/` own their controllers/services; `src/app.module.ts` composes them. Prisma persists application and session data in PostgreSQL. Discord Gateway handling lives in the Discord modules. The server also connects to Redis and internal Rust services.
- `services/*` contains Rust engines (including slowmode, anomaly detection, analytics, and sentinel). Protocol definitions and service configuration are maintained alongside the relevant service. The Nest server is the HTTP-facing integration point; internal engines are not frontend APIs.
- `docker-compose.yml` defines the production stack, service dependencies, private network, and runtime environment. The root `Makefile` is the cross-repository command entry point; `.github/workflows/deploy.yml` builds and publishes container images and deploys the Compose stack.

### Cross-cutting flows

- Discord OAuth establishes an `express-session` session in the backend. Browser API calls should continue using the client app's same-origin `/api` proxy so the session cookie follows the user. OAuth state and redirect handling are in `apps/server/src/auth/`.
- Guild-scoped APIs use session authentication plus guild access checks. Owner APIs under `apps/server/src/owner/` additionally use `OwnerAccessGuard`, which matches the authenticated Discord user ID to `OWNER_DISCORD_ID`. A hidden route or UI check is not an authorization boundary; preserve the server guard.
- Database schema and migrations are in `apps/server/prisma/`. Apply migrations through the existing Prisma scripts; do not reset or push schemas against production data.
- The Rust engines communicate with the Nest orchestrator over HTTP or gRPC as configured per service. Check both the service implementation/proto and its Nest client when changing an inter-service contract.

## Common commands

Run JavaScript commands from the corresponding app directory, or use the root Makefile where available. Bun is the project runtime/package manager.

```sh
# Start local apps/services (separate terminals)
make dev-client
make dev-server
make dev-slowmode
make dev-anomaly

# Frontend
cd apps/client && bun install
cd apps/client && bun run build
cd apps/client && bun run typecheck
cd apps/client && bun run lint

# Backend
cd apps/server && bun install
cd apps/server && bun run dev
cd apps/server && bun run build
cd apps/server && bun run lint
cd apps/server && bun run test
cd apps/server && bun run test -- --runInBand src/owner/owner-access.guard.spec.ts

# Monorepo checks
make test

# Database client and migrations (from apps/server)
bun run prisma:generate
bun run prisma:deploy

# Compose stack
make up-build
make logs
make down
```

`make test` runs the client TypeScript check, server Jest suite, and Rust Cargo tests for slowmode and anomaly; it does not run every service or build every application. Use the service-specific Makefile/Cargo commands when changing analytics or sentinel. The client package defines `lint` as `next lint`; if the installed Next.js version no longer supports that command, use the error output to select its current lint invocation rather than assuming the root has a unified lint script.

## Project-specific notes

- Root `README.md` documents environment setup, migrations, deployment, and the broader command matrix. Backend-specific modules and the resumable media-upload flow are described in `apps/server/README.md`.
- Local development requires Bun; Rust work additionally requires stable Rust/Cargo and, for protobuf compilation, `protoc`. The backend expects its environment file at `apps/server/.env`; Compose provides PostgreSQL and Redis services, while OAuth and Discord features require the relevant configured application/bot values.
- Use `apps/server/src/owner/owner-access.guard.spec.ts` as the focused example for running a single Jest test. Most server tests are colocated with their modules.
- Some README deployment notes and Makefile targets cover only a subset of the current services; inspect `docker-compose.yml`, service-local `Makefile`s, and workflow definitions before changing deployment behavior.
