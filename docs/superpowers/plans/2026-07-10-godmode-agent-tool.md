# Godmode Dynamic Tool Execution (Hermes Agent) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `execute_godmode_script` tool using Node.js `node:vm` sandboxing, restricting execution strictly to the Discord ID configured in `process.env.OWNER_DISCORD_ID`.

**Architecture:**
- Declare the `execute_godmode_script` tool schema in `discord-agent-tools.ts`.
- Implement a VM sandbox runner in `DiscordAgentToolExecutorService.ts` providing global access to the Prisma client, Discord.js client, and console logs helper.
- Verify user permission in `execute` matching `requestedById === process.env.OWNER_DISCORD_ID` and throwing a `ForbiddenException` for other users.

**Tech Stack:** NestJS, Discord.js, node:vm, TypeScript, Jest

## Global Constraints
- Do not append `Co-Authored-By` footers to git commits.
- Restrict VM execution time to 5 seconds.
- Sandboxed environment must catch all errors safely.

---

### Task 1: Declare Godmode Tool Schema

**Files:**
- Modify: `apps/server/src/discord-agent/discord-agent-tools.ts`

**Interfaces:**
- Produces: `execute_godmode_script` parameter definition.

- [ ] **Step 1: Declare execute_godmode_script**

In `apps/server/src/discord-agent/discord-agent-tools.ts`, append the tool declaration inside the tool list array:
```typescript
  {
    name: 'execute_godmode_script',
    description: 'EXCLUSIVELY FOR OWNER: Write and execute dynamic JavaScript code on the server using Node VM. Sandbox has access to `prisma` (database client) and `client` (Discord client). Code must return a value or set a variable. Only executable if requested by the designated Owner ID.',
    parameters: {
      type: 'OBJECT',
      properties: {
        code: { type: 'STRING', description: 'The JavaScript code to execute inside the sandbox.' },
      },
      required: ['code'],
    },
  },
```

- [ ] **Step 2: Check NestJS compile status**

Run syntax check:
```bash
cd apps/server && npm run build -- --noEmit || true
```
Expected: Compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/discord-agent/discord-agent-tools.ts
git commit -m "feat(agent): declare execute_godmode_script tool"
```

---

### Task 2: Implement Sandbox VM Runner and Owner Verification

**Files:**
- Modify: `apps/server/src/discord-agent/discord-agent-tool-executor.service.ts`
- Modify: `apps/server/src/discord-agent/discord-agent-tool-executor.service.spec.ts`

**Interfaces:**
- Consumes: JavaScript `code` parameter string and `requestedById` user ID.
- Produces: Execution results, console log outputs, and dynamic data query responses.

- [ ] **Step 1: Add unit tests for Godmode execution**

In `apps/server/src/discord-agent/discord-agent-tool-executor.service.spec.ts`, write unit tests:
1. Verify `execute_godmode_script` rejects calls from non-owner IDs.
2. Verify executing a simple mathematical evaluation (e.g. `2 + 2`) returns `{ success: true, result: 4 }`.
3. Verify database client queries run and return results.

- [ ] **Step 2: Run test suite to verify it fails**

Run: `npx jest --runInBand apps/server/src/discord-agent/discord-agent-tool-executor.service.spec.ts`
Expected: Test fails due to missing switch case.

- [ ] **Step 3: Implement execution routing and sandbox**

In `apps/server/src/discord-agent/discord-agent-tool-executor.service.ts`:
- Import `vm` at the top:
```typescript
import * as vm from 'node:vm';
```
- Add switch case for `execute_godmode_script`:
```typescript
      case 'execute_godmode_script':
        return this.executeGodmodeScript(
          this.requireString(args.code, 'code'),
          context.requestedById,
        );
```
- Implement the `executeGodmodeScript` helper method:
  1. Retrieve `process.env.OWNER_DISCORD_ID`.
  2. Throw `ForbiddenException` if `requestedById` does not match the configured owner ID or if owner ID is missing.
  3. Prepare logs collector array and define `sandbox` context exposing `prisma`, `client`, `console.log` interceptor, and a container for the return value.
  4. Instantiate `vm.Script` wrapping the input code in an async runner, executing it under a `5000ms` timeout.
  5. Wait briefly for async execution and return `{ success: true, logs, result }` on success, or `{ success: false, error }` on exception catch.

- [ ] **Step 4: Run unit tests to verify they pass**

Run: `cd apps/server && npx jest --runInBand src/discord-agent/discord-agent-tool-executor.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run all workspace tests**

Run: `cd apps/server && npx jest --runInBand`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/discord-agent/discord-agent-tool-executor.service.ts apps/server/src/discord-agent/discord-agent-tool-executor.service.spec.ts
git commit -m "feat(agent): implement godmode execution sandboxing using node:vm"
```
