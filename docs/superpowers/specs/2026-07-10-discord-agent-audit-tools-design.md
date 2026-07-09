# Discord Agent Audit Tools & Reply Context Design

## Goal

Add a read-only **Audit** feature to the Discord AI moderator agent, and make AI mentions understand the Discord message being replied to as direct context.

## Scope

This spec covers two related improvements:

1. Structured read-only audit tools that answer moderation-investigation questions such as:
   - “Siapa yang nambahin role ke user ini?”
   - “Siapa yang revoke role dari user ini?”
   - “Siapa yang timeout user ini?”
   - “Timeout ini dicabut siapa?”
   - “Mod ini action apa aja?”
2. Reply context injection when a moderator replies to someone’s message while mentioning the AI.

The Audit feature does not execute Discord moderation actions, does not create proposal cards, and does not persist audit snapshots to the database in this version.

## Recommended Approach

Use Discord’s official Guild Audit Logs API at request time, then normalize raw audit entries into a shape that is easy for the AI to reason about. This keeps the feature read-only and avoids the storage/scheduler scope of a database-backed audit index.

The existing `get_discord_audit_logs` tool can remain for backward compatibility, but the AI-facing feature should prefer structured tools:

- `get_audit_logs`
- `get_member_audit_trail`
- `get_moderator_actions`
- `search_audit_events`

## Architecture

### Tool declarations

Update `apps/server/src/discord-agent/discord-agent-tools.ts` with four Audit tools.

`get_audit_logs` accepts optional filters:

```ts
{
  category?: 'role' | 'timeout' | 'ban' | 'kick' | 'channel' | 'server' | 'other';
  actionType?: string;
  targetUserId?: string;
  executorId?: string;
  limit?: number;
}
```

`get_member_audit_trail` accepts:

```ts
{
  targetUserId: string;
  limit?: number;
}
```

`get_moderator_actions` accepts:

```ts
{
  moderatorId: string;
  limit?: number;
}
```

`search_audit_events` accepts:

```ts
{
  query: string;
  limit?: number;
}
```

All four tools are read-only and execute immediately. None should create `AgentActionProposal` records.

### Executor integration

Update `apps/server/src/discord-agent/discord-agent-tool-executor.service.ts`.

Add switch cases for the four tools. They should call helper methods that fetch Discord audit logs with a default limit of 15 and a maximum of 50. The service already has Discord client access, guild fetching, numeric clamping, and `ViewAuditLog` permission checking patterns in `getDiscordAuditLogs`; reuse those patterns.

Normalize each audit entry to this shape:

```ts
{
  id: string;
  action: string | number;
  actionLabel: string;
  category: 'role' | 'timeout' | 'ban' | 'kick' | 'channel' | 'server' | 'other';
  executor: { id: string | null; tag: string | null };
  target: { id: string | null; type: string | null };
  roleChanges?: {
    added: Array<{ id?: string; name?: string }>;
    removed: Array<{ id?: string; name?: string }>;
  };
  timeoutChange?: {
    oldUntil?: string | null;
    newUntil?: string | null;
    revoked: boolean;
  };
  reason: string | null;
  createdAt: Date;
  changes: Array<{ key: string; old: unknown; new: unknown }>;
}
```

The response envelope should include count metadata:

```ts
{
  guildId: string;
  count: number;
  entries: NormalizedAuditEntry[];
}
```

### Audit normalization rules

The mapper should derive human-facing fields from Discord audit entry action and changes:

- Member role add/remove:
  - category: `role`
  - `actionLabel`: `Member role update`
  - parse role changes from change keys such as `$add`, `$remove`, or `roles` when Discord provides them
- Member timeout set/update/revoke:
  - category: `timeout`
  - parse `communication_disabled_until`
  - `revoked: true` when the new value is null/empty and the old value was set
- Ban:
  - category: `ban`
- Kick:
  - category: `kick`
- Role update/create/delete:
  - category: `role`
- Channel update/create/delete:
  - category: `channel`
- Guild/server setting updates:
  - category: `server`
- Unknown action types:
  - category: `other`
  - preserve raw `action` and `changes`

Filters apply after normalization, except `executorId` may be passed to Discord’s `fetchAuditLogs({ user })` when available to reduce returned entries. `targetUserId` must filter by normalized target ID, not executor.

`search_audit_events` should implement simple text matching over normalized audit entries in this version. It should match against:

- entry ID
- executor ID/tag
- target ID/type
- category
- action label
- reason
- serialized change values
- role names/IDs from `roleChanges`

No semantic database search is required.

### Permission and failure behavior

The bot must have `ViewAuditLog`. If it does not, the executor should throw `ForbiddenException('Bot lacks View Audit Log permission in this server.')`. The existing AI tool loop catches executor errors and returns them as tool responses, allowing the model to explain the missing permission to the moderator.

If no entries match, return `{ guildId, count: 0, entries: [] }` rather than throwing.

If Discord returns unfamiliar action/change structures, preserve the raw change keys and values in `changes` so the AI can still inspect the result.

## Reply Context Design

### Current behavior

`apps/server/src/discord/discord-bot.service.ts` currently fetches a referenced Discord message only to check whether the moderator replied to a prior bot message. If yes, it passes `referencedBotMessageId` into `DiscordAgentService.handleMention(...)` so conversation memory can be loaded.

### New behavior

When a moderator replies to any message and mentions/tags the AI:

- If the referenced message belongs to the bot, keep the existing conversation-memory behavior.
- If the referenced message belongs to another user or moderator, pass the referenced message as read-only prompt context.
- If the referenced message fetch fails, continue without reply context.

Add a lightweight context type, for example:

```ts
export type ReferencedMessageContext = {
  id: string;
  channelId: string;
  authorId: string;
  authorTag: string;
  content: string;
  createdAt: Date;
  attachments: Array<{ name?: string | null; url: string; contentType?: string | null }>;
  embeds: unknown[];
};
```

`DiscordAgentService.handleMention(...)` should accept this optional context. Before calling the provider, it should include the replied-to message in the user prompt, using clear Indonesian framing:

```txt
Konteks pesan yang di-reply:
Author: <authorTag> (<authorId>)
Channel: <channelId>
Waktu: <ISO timestamp>
Isi:
<content or "(no text content)">
Attachments: <name/url list or "none">

Permintaan moderator:
<original prompt>
```

The stored conversation prompt should remain the moderator’s cleaned prompt, not the expanded internal prompt. This keeps memory readable and avoids repeatedly storing large context blocks.

## Data Flow

### Audit tool flow

1. Moderator asks the AI an audit question.
2. The model selects one of the Audit tools.
3. `DiscordAgentToolExecutorService.execute(...)` routes the call to an audit helper.
4. The helper checks bot readiness and `ViewAuditLog` permission.
5. The helper fetches Discord audit logs with a safe limit.
6. The helper normalizes, filters, and returns a read-only response envelope.
7. The model summarizes the answer in Indonesian.

### Reply context flow

1. Moderator replies to a Discord message and mentions the AI.
2. `DiscordBotService.handleAgentMessage(...)` fetches `message.reference.messageId`.
3. If the referenced message is the bot’s message, it passes `referencedBotMessageId` for memory.
4. If the referenced message is not the bot’s message, it formats `ReferencedMessageContext` and passes it to `DiscordAgentService.handleMention(...)`.
5. `DiscordAgentService` prepends the context to the provider prompt only for this turn.
6. The AI answers using the replied-to message as the meaning of “ini/this/pesan ini”.

## Testing Plan

Add or update unit tests for:

- `get_audit_logs` returns normalized audit entries and preserves raw changes.
- `get_member_audit_trail` filters by normalized target user ID.
- `get_moderator_actions` filters by executor/moderator ID.
- `search_audit_events` matches role names, IDs, action labels, reasons, and user IDs.
- Missing `ViewAuditLog` permission produces `ForbiddenException`.
- Replying to a non-bot message while mentioning the AI injects referenced message context into the provider prompt.
- Replying to a bot message still loads conversation memory via `referencedBotMessageId`.
- Stored conversation turns keep the clean moderator prompt rather than the expanded internal prompt.

## Non-Goals

- No automatic undo/revert moderation actions.
- No punishment or proposal generation from Audit tools.
- No periodic audit log indexing.
- No long-term audit storage in Prisma/Postgres.
- No UI dashboard changes in this version.

## Implementation Notes

This should be folded into the existing Advanced AI Moderator Tools work as an additional read-only tool group plus the reply-context enhancement. The implementation should follow the existing NestJS service patterns and Jest testing style in `apps/server/src/discord-agent/discord-agent-tool-executor.service.spec.ts` and `apps/server/src/discord-agent/discord-agent.service.spec.ts`.
