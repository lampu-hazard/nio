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