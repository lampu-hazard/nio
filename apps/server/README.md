# nio-backend

The backend API server and Discord bot controller for the nio dashboard. This project acts as the central orchestrator, managing Discord interactions, guild configurations, self-role assignment interfaces, and custom media storage.

## System Architecture & Modules

The application is built on top of NestJS using a modular monolith pattern, ensuring clear separation of concerns:

- **Core Module (`src/app.module.ts`)**: Integrates global configurations, logger setups, and dependency modules.
- **Discord Bot Module (`src/discord/`)**: Controls the live discord.js bot instance. It listens to user interactions (buttons, select menus) and message creation events, handling them via dedicated services.
- **Stickers Module (`src/stickers/`)**: Handles administration and delivery of keyword-triggered images (stickers). Includes presigned URL generators for direct Cloudflare R2 uploads, database metadata persistence, and in-memory caching to optimize bot lookups.
- **Self-Roles Module (`src/self-roles/`)**: Manages the logic for dynamic member role toggles based on Discord interaction events.
- **Panels Module (`src/panels/`)**: Provides CRUD APIs and publishing services to render and send stylized panel interfaces directly to Discord text channels.
- **Guilds Module (`src/guilds/`)**: Performs validation of Discord server configurations, role hierarchies, and audit logging.
- **Prisma Module (`src/prisma/`)**: Manages the database connection lifecycle via Prisma Client.
- **R2 Module (`src/r2/`)**: Adapts the AWS S3 SDK to interact with Cloudflare R2 object storage for media management.

## Key System Flows

### Resumable Media Upload Flow
```
Dashboard Frontend                   Backend API                     Cloudflare R2
        |                                 |                                |
        |-- Request Upload URL ---------->|                                |
        |   (File Info & Type)            |-- Generate Presigned PUT URL --|
        |<-- Presigned URL & Key ---------|                                |
        |                                 |                                |
        |-- Direct Binary PUT -------------------------------------------->|
        |   (Supports native S3 retry)                                     |
        |<-- 200 OK -------------------------------------------------------|
        |                                 |                                |
        |-- Save Metadata (Sticker Name) ->|                                |
        |                                 |-- Verify File Existence -------|
        |                                 |   (S3 headObject check) ------->|
        |                                 |<-- File Exists ----------------|
        |                                 |-- Save to PostgreSQL (Prisma)  |
        |                                 |-- Update Bot Memory Cache      |
        |<-- Success (201 Created) -------|                                |
```

### Discord Keyword Trigger Flow
1. A user sends a message in an enabled Discord server channel.
2. The bot intercepts the message (requires Message Content Intent).
3. The message content is normalized and matched against an in-memory keyword cache to prevent DB queries on every message.
4. If a match is found, the bot responds by sending a rich embed referencing the public R2 media URL.

### Voice XP and Notifications

Apply the additive migration with `bun run prisma:deploy` before starting the updated server. In guild **Settings**, enable Voice XP, choose XP per minute (default 10), and add level/role rewards. A level needs `100 × level²` total XP; rewards are cumulative and existing roles are never removed.

A human earns XP in a regular voice channel with another eligible human or a bot companion. Humans must be unmuted and undeafened; bots count as companions even when muted/deafened (including music bots), but never receive XP or reward roles. Being alone, AFK/stage channels and bot downtime do not earn XP. Bot joins, leaves and moves immediately update the eligible interval without sending bot voice notifications. Balances are saved every 60 seconds while members remain connected and at voice-state transitions; old voice-session history is not converted. Run only one gateway owner per guild; independent duplicate bot replicas require distributed ownership before enabling XP.

If voice tracking fails with Prisma `P2022` for `GuildSettings.voiceXpEnabled`, check the intended database read-only before changing XP settings. The migrations `20261101000000_voice_xp_and_notifications` and `20261101010000_voice_level_up_notifications` add the settings and balance/reward tables. For an existing database with no `_prisma_migrations` history, reconcile its actual schema and baseline after backup and administrator approval before running the existing Prisma deploy script; do not blindly apply all pending migrations, reset, or schema-push. After migration, Voice XP must still be enabled explicitly (default is disabled).

The independent **Voice notifications** channel setting sends plain join, leave and move embeds. The bot needs View Channel, Send Messages and Embed Links there, and Manage Roles with reward roles below its highest role for level rewards. Selecting Disabled stops notifications without disabling XP.

### Panel visual preview

Panel documents use an additive nullable JSON column and an integer revision. Generate types with `bun run prisma:generate`; apply pending additive migrations through `bun run prisma:deploy` only against the intended database. Never reset or schema-push production. Local database acceptance requires a disposable database.

If panel reads fail with Prisma `P2022` for `Panel.visualDocument` or `Panel.revision`, the deployed code is newer than the database. Confirm the target database and migration history with `bunx prisma migrate status`. After backup and administrator approval, apply the existing `20261103000000_panel_visual_document` migration through `bun run prisma:deploy` (or `docker compose run --rm nio-migrate` on the intended Compose host). It adds columns without deleting panels. Do not run `migrate reset` or `db push`. An existing database with no recorded baseline must have its migration history reconciled against its actual schema first; blindly applying every pending migration can fail on existing tables. The API returns `503 DATABASE_SCHEMA_OUTDATED` with a safe explanation until the schema is aligned.

The dashboard editor separates Edit, Roles (self-role panels only), and Discord preview. Edit groups Content, Appearance, and Settings without unmounting drafts. Save precedes Publish; changing roles advances the same revision. Canvas has a free-positioned raster image plus separate native Discord text and controls, not freely positioned Discord buttons. Run one orchestrator owner per guild: local publish locks do not coordinate independent replicas.

`R2_PUBLIC_URL` must be an absolute HTTPS URL (for example `https://cdn.example.com`), without credentials, query or fragment. Canvas assets must be uploaded under `panels/<current-guild-id>/`; external URLs are not downloaded by the renderer. Only static PNG/JPEG/WebP are accepted: 5 MiB input, 16 million decoded pixels, 8 MiB output. Bundled DejaVu Sans fonts are copied by Nest build; unsupported glyphs and overflowing text block export.

Authenticated guild-scoped POST routes `panels/visual-preview` and `panels/:panelId/visual-preview` accept `{visualDocument,expectedRevision}` and return a no-store PNG. Saved previews require the current revision. Limits are ten previews/minute per user+guild, two active jobs, eight pending jobs, a five-second total deadline and two-second asset download timeout. Native raster work runs in disposable workers. Bun source and compiled CommonJS entry points are supported; Node source loading uses the existing ts-node transpile-only loader after normal build/typecheck.

## Technology Stack

- **Runtime**: Bun
- **Framework**: NestJS (TypeScript)
- **Database Wrapper**: Prisma ORM
- **Database Engine**: PostgreSQL
- **Bot Engine**: discord.js v14
- **Object Storage SDK**: `@aws-sdk/client-s3` (S3 compatible)
- **Logger**: Winston

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.