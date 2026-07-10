# Godmode Dynamic Tool Agent Design

## Goal

Add a **Godmode** feature allowing the AI agent to write and execute dynamic JavaScript code directly on the server to solve custom tasks, restricted strictly to the Discord Server Owner.

## Scope

- Introduce a new read-write tool `execute_godmode_script` which evaluates arbitrary JavaScript code in a sandboxed `node:vm` environment.
- Restrict execution using `process.env.OWNER_DISCORD_ID`.
- Provide the sandboxed code access to database Client (`prisma`) and Discord Bot Client (`client`).

## Recommended Approach

### Tool Schema
Add the new tool to `apps/server/src/discord-agent/discord-agent-tools.ts`:

```ts
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
  }
```

### Sandbox Execution Environment
Implement the code execution safely using Node's native `node:vm` module inside `DiscordAgentToolExecutorService.ts`.

Ensure:
- Validate `context.requestedById === process.env.OWNER_DISCORD_ID`.
- Limit execution time to `5000ms` to prevent CPU lockups.
- Feed console logs, database instances, and Discord client instances directly into the context.

## Testing Plan
- Test that executing `execute_godmode_script` by a non-owner ID throws `ForbiddenException`.
- Test executing a simple JS snippet (e.g. `2 + 2`) returns the expected output value.
- Test that asynchronous Prisma database queries inside the VM sandbox execute and return records successfully.

## Non-Goals
- No shell/Bash execution access within the VM sandbox (strict security).
- No frontend settings for editing Owner ID (configured solely via server `.env`).
