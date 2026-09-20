import { BadRequestException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AiToolDefinition, JsonSchema, ToolSafety } from './interfaces/ai-provider.interface';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_OUTPUT_LIMIT = 32_000;
const TOOL_PREFIX = 'mcp__';

type McpServerConfig = {
  name: string;
  transport: 'http' | 'stdio';
  url?: string;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  tools: { read?: string[]; write?: string[] };
};

export type ResolvedTool = {
  config: McpServerConfig;
  remoteName: string;
  safety: ToolSafety;
};

@Injectable()
export class McpToolService implements OnModuleDestroy {
  private readonly clients = new Map<string, Client>();

  async definitions(): Promise<AiToolDefinition[]> {
    const definitions: AiToolDefinition[] = [];
    for (const config of this.configs()) {
      const allowed = this.allowedTools(config);
      if (!allowed.size) continue;
      const client = await this.clientFor(config);
      const response = await client.listTools(undefined, { timeout: this.timeoutMs() });
      for (const tool of response.tools) {
        const safety = allowed.get(tool.name);
        if (!safety) continue;
        definitions.push({
          name: this.publicName(config.name, tool.name),
          description: `[MCP ${config.name}] ${tool.description || tool.name}`,
          parameters: (tool.inputSchema || { type: 'object', properties: {} }) as JsonSchema,
          safety,
        });
      }
    }
    return definitions;
  }

  async execute(publicName: string, args: unknown) {
    const resolved = this.resolve(publicName);
    if (!resolved) throw new BadRequestException(`Unknown or disallowed MCP tool: ${publicName}`);
    const client = await this.clientFor(resolved.config);
    const result = await client.callTool(
      { name: resolved.remoteName, arguments: this.objectArgs(args) },
      undefined,
      { timeout: this.timeoutMs() },
    );
    return this.capOutput(result);
  }

  safety(publicName: string) {
    return this.resolve(publicName)?.safety;
  }

  async onModuleDestroy() {
    await Promise.allSettled([...this.clients.values()].map((client) => client.close()));
    this.clients.clear();
  }

  private configs(): McpServerConfig[] {
    const raw = process.env.MCP_SERVERS_JSON?.trim();
    if (!raw) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException('MCP_SERVERS_JSON must be valid JSON.');
    }
    if (!Array.isArray(parsed)) throw new BadRequestException('MCP_SERVERS_JSON must be an array.');
    return parsed.map((item, index) => this.validateConfig(item, index));
  }

  private validateConfig(value: unknown, index: number): McpServerConfig {
    if (!value || typeof value !== 'object') throw new BadRequestException(`MCP server ${index} must be an object.`);
    const config = value as McpServerConfig;
    if (!/^[a-z0-9_]+$/.test(config.name || '')) throw new BadRequestException(`MCP server ${index} has an invalid name.`);
    if (config.transport !== 'http' && config.transport !== 'stdio') throw new BadRequestException(`MCP server ${config.name} has an invalid transport.`);
    if (config.transport === 'http') {
      let url: URL;
      try { url = new URL(config.url || ''); } catch { throw new BadRequestException(`MCP server ${config.name} requires a valid URL.`); }
      if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException(`MCP server ${config.name} URL must use HTTP(S).`);
    } else if (!config.command?.trim()) {
      throw new BadRequestException(`MCP server ${config.name} requires a stdio command.`);
    }
    if (!config.tools || typeof config.tools !== 'object') throw new BadRequestException(`MCP server ${config.name} requires an explicit tool allowlist.`);
    return config;
  }

  private allowedTools(config: McpServerConfig) {
    const tools = new Map<string, ToolSafety>();
    for (const name of config.tools.read || []) tools.set(name, { mode: 'read', proposalRequired: false });
    for (const name of config.tools.write || []) tools.set(name, { mode: 'write', proposalRequired: true, ownerOnly: true });
    return tools;
  }

  resolve(publicName: string): ResolvedTool | undefined {
    if (!publicName.startsWith(TOOL_PREFIX)) return undefined;
    for (const config of this.configs()) {
      const prefix = `${TOOL_PREFIX}${config.name}__`;
      if (!publicName.startsWith(prefix)) continue;
      const remoteName = publicName.slice(prefix.length);
      const safety = this.allowedTools(config).get(remoteName);
      if (safety) return { config, remoteName, safety };
    }
    return undefined;
  }

  private publicName(server: string, tool: string) {
    return `${TOOL_PREFIX}${server}__${tool.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  }

  private async clientFor(config: McpServerConfig) {
    const cached = this.clients.get(config.name);
    if (cached) return cached;
    const client = new Client({ name: 'nio-discord-agent', version: '1.0.0' });
    const transport = config.transport === 'http'
      ? new StreamableHTTPClientTransport(new URL(config.url!), { requestInit: { headers: config.headers } })
      : new StdioClientTransport({
        command: config.command!,
        args: config.args,
        cwd: config.cwd,
        env: config.env,
        stderr: 'pipe',
        maxBufferSize: this.outputLimit() * 2,
      });
    await client.connect(transport, { timeout: this.timeoutMs() });
    this.clients.set(config.name, client);
    return client;
  }

  private capOutput(value: unknown) {
    const serialized = JSON.stringify(value);
    const limit = this.outputLimit();
    if (serialized.length <= limit) return value;
    return { truncated: true, content: serialized.slice(0, limit) };
  }

  private objectArgs(args: unknown): Record<string, unknown> {
    return args && typeof args === 'object' && !Array.isArray(args) ? args as Record<string, unknown> : {};
  }

  private timeoutMs() {
    return this.boundedEnvNumber('MCP_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, 1_000, 60_000);
  }

  private outputLimit() {
    return this.boundedEnvNumber('MCP_MAX_OUTPUT_CHARS', DEFAULT_OUTPUT_LIMIT, 1_000, 100_000);
  }

  private boundedEnvNumber(name: string, fallback: number, min: number, max: number) {
    const parsed = Number(process.env[name]);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
  }
}
