# Discord Agent Audit Tools & Reply Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement read-only structured Discord audit log tools (`get_audit_logs`, `get_member_audit_trail`, `get_moderator_actions`, `search_audit_events`) and inject referenced non-bot message content as prompt context when replying to mentions.

**Architecture:**
- Define the new tool parameters in `discord-agent-tools.ts`.
- Map and normalize Discord Audit Log actions (member updates, role updates, kicks, bans) inside `DiscordAgentToolExecutorService` to provide clear human-readable categorizations for the AI.
- Throw a proper error if the bot lacks `ViewAuditLog` permission.
- Capture referenced message parameters (non-bot author, content, attachments) in `DiscordBotService.handleAgentMessage` and pass them into `DiscordAgentService.handleMention`.
- Inject the formatted referenced message context directly into the Gemini user prompt.

**Tech Stack:** NestJS, Discord.js, TypeScript, Jest

## Global Constraints
- Do not write/upload temporary files to local disk when downloading/parsing logs.
- Strict read-only enforcement on audit tools (no proposal generation or database writing).
- Keep backward compatibility for the existing `get_discord_audit_logs` tool.
- Stored conversation turns must keep the clean moderator prompt, not the internally expanded prompt.

---

### Task 1: Update Action Types & Schema Tools

**Files:**
- Modify: `apps/server/src/discord-agent/discord-agent-tools.ts`

**Interfaces:**
- Produces: Parameter schemas for the four new audit tools: `get_audit_logs`, `get_member_audit_trail`, `get_moderator_actions`, `search_audit_events`.

- [ ] **Step 1: Declare the new tools in `discord-agent-tools.ts`**

Modify `apps/server/src/discord-agent/discord-agent-tools.ts` by appending:

```typescript
  {
    name: 'get_audit_logs',
    description: 'Fetch general normalized Discord audit logs with optional filters. Read-only; executed immediately.',
    parameters: {
      type: 'OBJECT',
      properties: {
        category: { type: 'STRING', enum: ['role', 'timeout', 'ban', 'kick', 'channel', 'server', 'other'], description: 'Filter events by category.' },
        actionType: { type: 'STRING', description: 'Raw action type code or name to filter by.' },
        targetUserId: { type: 'STRING', description: 'Optional user ID to filter by action target.' },
        executorId: { type: 'STRING', description: 'Optional moderator user ID who executed the action.' },
        limit: { type: 'INTEGER', description: 'Maximum log entries to return (1-50, defaults to 15).' },
      },
    },
  },
  {
    name: 'get_member_audit_trail',
    description: 'Fetch normalized audit log history specifically targeting a single user ID (role additions/removals, timeouts, bans). Read-only; executed immediately.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetUserId: { type: 'STRING', description: 'Discord user ID of the target member.' },
        limit: { type: 'INTEGER', description: 'Maximum log entries to return (1-50, defaults to 15).' },
      },
      required: ['targetUserId'],
    },
  },
  {
    name: 'get_moderator_actions',
    description: 'Fetch normalized audit log history of actions performed by a specific moderator user ID. Read-only; executed immediately.',
    parameters: {
      type: 'OBJECT',
      properties: {
        moderatorId: { type: 'STRING', description: 'Discord user ID of the moderator/executor.' },
        limit: { type: 'INTEGER', description: 'Maximum log entries to return (1-50, defaults to 15).' },
      },
      required: ['moderatorId'],
    },
  },
  {
    name: 'search_audit_events',
    description: 'Perform a search query match over recent normalized audit events (matches text in labels, targets, executors, roles, or reasons). Read-only; executed immediately.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Search term to match (e.g., username, role name, or action name).' },
        limit: { type: 'INTEGER', description: 'Maximum log entries to return (1-50, defaults to 15).' },
      },
      required: ['query'],
    },
  },
```

- [ ] **Step 2: Verify code syntax**

Compile the project or run a quick syntax check.
```bash
cd apps/server && npm run build -- --noEmit || true
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/discord-agent/discord-agent-tools.ts
git commit -m "feat(agent): declare structured audit log tools" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Implement Audit Normalization & Routing in Tool Executor

**Files:**
- Modify: `apps/server/src/discord-agent/discord-agent-tool-executor.service.ts`
- Modify: `apps/server/src/discord-agent/discord-agent-tool-executor.service.spec.ts`

**Interfaces:**
- Produces: Execution logic for `get_audit_logs`, `get_member_audit_trail`, `get_moderator_actions`, `search_audit_events` with normalization helpers.

- [ ] **Step 1: Write failing tests for normalized audit log formatting**

In `apps/server/src/discord-agent/discord-agent-tool-executor.service.spec.ts`, add test cases for `get_audit_logs` filtering and normalization (role updates, timeouts, search matches, and permission errors).

```typescript
  it('normalizes role additions/removals and filters correctly', async () => {
    // Write test mock and expect assertions for normalizeAuditEntry role structures
  });

  it('throws ForbiddenException when bot lacks ViewAuditLog permission', async () => {
    // Test that client fetch throws or lacks permission, raising error
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --runInBand apps/server/src/discord-agent/discord-agent-tool-executor.service.spec.ts`
Expected: Failures on new test blocks.

- [ ] **Step 3: Implement normalization and executor routing**

In `apps/server/src/discord-agent/discord-agent-tool-executor.service.ts`, implement:
- Switch cases mapping to helper methods: `getAuditLogs`, `getMemberAuditTrail`, `getModeratorActions`, `searchAuditEvents`.
- A private helper `normalizeAuditEntry(entry: any): any` that maps:
  - Role add/remove (checks changes for role arrays/keys and sets category: `'role'`).
  - Member timeout (checks `communication_disabled_until` change key and maps `revoked` flag, setting category: `'timeout'`).
  - Kicks and Bans (category `'kick'` and `'ban'`).
  - Other Discord audit actions (categories `'channel'`, `'server'`, `'other'`).
- Filter application: target checks (`targetId`), executor checks (`executorId`), query matching checks (checks text components).
- Permission check verifying `ViewAuditLog` and throwing a NestJS `ForbiddenException` if absent.

- [ ] **Step 4: Verify tests pass**

Run: `npx jest --runInBand apps/server/src/discord-agent/discord-agent-tool-executor.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/discord-agent/discord-agent-tool-executor.service.ts apps/server/src/discord-agent/discord-agent-tool-executor.service.spec.ts
git commit -m "feat(agent): implement normalized audit tool execution and filtering" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Inject Replied-To Message Context

**Files:**
- Modify: `apps/server/src/discord/discord-bot.service.ts`
- Modify: `apps/server/src/discord-agent/discord-agent.service.ts`
- Modify: `apps/server/src/discord-agent/discord-agent.service.spec.ts`

**Interfaces:**
- Consumes: Replied-to message properties.
- Produces: Modified agent system-prompt context block.

- [ ] **Step 1: Add unit tests for reply-context injection**

In `apps/server/src/discord-agent/discord-agent.service.spec.ts`, add a test verifying that when `replyContext` is passed, the user prompt generated for the provider contains the formatted replied-to message context, but the final saved conversation history still records the moderator’s original prompt.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --runInBand apps/server/src/discord-agent/discord-agent.service.spec.ts`
Expected: Failures on compile or test cases.

- [ ] **Step 3: Modify handleMention signature and prompt construction**

In `apps/server/src/discord-agent/discord-agent.service.ts`:
- Define `ReferencedMessageContext` type:
```typescript
export type ReferencedMessageContext = {
  id: string;
  channelId: string;
  authorId: string;
  authorTag: string;
  content: string;
  createdAt: Date;
  attachments: Array<{ name: string; url: string }>;
};
```
- Update `handleMention` signature to take an optional `replyContext?: ReferencedMessageContext`.
- If `replyContext` is present, construct a formatted string and prepended it to `userPrompt` before sending to the provider:
```typescript
let userPrompt = prompt;
if (replyContext) {
  const attachmentLines = replyContext.attachments.length
    ? replyContext.attachments.map(a => `- ${a.name}: ${a.url}`).join('\n')
    : 'none';
  userPrompt = `Konteks pesan yang di-reply:
Author: ${replyContext.authorTag} (${replyContext.authorId})
Channel: <#${replyContext.channelId}>
Waktu: ${replyContext.createdAt.toISOString()}
Isi:
${replyContext.content || '(no text content)'}
Attachments: ${attachmentLines}

Permintaan moderator:
${prompt}`;
}
```
- Ensure the conversation turn saved to history/Prisma database logs uses the original raw `prompt`, not the expanded `userPrompt`.

- [ ] **Step 4: Update Discord bot handler to fetch and pass reply context**

In `apps/server/src/discord/discord-bot.service.ts`:
- Inside `handleAgentMessage`, inspect if `message.reference?.messageId` points to a non-bot message.
- If it does, fetch the referenced message. If it is NOT written by the bot itself, populate `replyContext` fields and pass it to `this.agent.handleMention`:
```typescript
let replyContext: any = undefined;
if (message.reference?.messageId) {
  const refMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
  if (refMsg) {
    if (refMsg.author.id === this.client.user?.id) {
      referencedBotMessageId = refMsg.id;
    } else {
      replyContext = {
        id: refMsg.id,
        channelId: refMsg.channel.id,
        authorId: refMsg.author.id,
        authorTag: refMsg.author.tag,
        content: refMsg.content || '',
        createdAt: refMsg.createdAt,
        attachments: refMsg.attachments.map(a => ({ name: a.name, url: a.url })),
      };
    }
  }
}
```
- Call `this.agent.handleMention(...)` passing `replyContext`.

- [ ] **Step 5: Run all test suites**

Run all tests in workspace:
```bash
cd apps/server && npx jest --runInBand
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/discord/discord-bot.service.ts apps/server/src/discord-agent/discord-agent.service.ts apps/server/src/discord-agent/discord-agent.service.spec.ts
git commit -m "feat(discord): inject replied-to message context into AI mention prompt" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```
