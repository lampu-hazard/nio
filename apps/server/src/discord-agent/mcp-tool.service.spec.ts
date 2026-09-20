import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { McpToolService } from './mcp-tool.service';

describe('McpToolService', () => {
  let service: McpToolService;

  beforeEach(() => {
    delete process.env.MCP_SERVERS_JSON;
    delete process.env.MCP_TIMEOUT_MS;
    delete process.env.MCP_MAX_OUTPUT_CHARS;
    service = new McpToolService();
  });

  it('returns empty definitions when MCP_SERVERS_JSON is not set', async () => {
    const definitions = await service.definitions();
    expect(definitions).toEqual([]);
  });

  it('throws BadRequestException on invalid JSON in MCP_SERVERS_JSON', async () => {
    process.env.MCP_SERVERS_JSON = '{ invalid json';
    await expect(service.definitions()).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when MCP_SERVERS_JSON is not an array', async () => {
    process.env.MCP_SERVERS_JSON = '{"not": "an array"}';
    await expect(service.definitions()).rejects.toThrow('MCP_SERVERS_JSON must be an array.');
  });

  it('validates server names and transports', async () => {
    process.env.MCP_SERVERS_JSON = JSON.stringify([
      { name: 'invalid-name-with-dashes!', transport: 'http', url: 'http://localhost:3000' },
    ]);
    await expect(service.definitions()).rejects.toThrow('invalid name');

    process.env.MCP_SERVERS_JSON = JSON.stringify([
      { name: 'valid_name', transport: 'ftp', url: 'ftp://localhost:3000' },
    ]);
    await expect(service.definitions()).rejects.toThrow('invalid transport');

    process.env.MCP_SERVERS_JSON = JSON.stringify([
      { name: 'valid_name', transport: 'http', url: 'invalid-url' },
    ]);
    await expect(service.definitions()).rejects.toThrow('requires a valid URL');

    process.env.MCP_SERVERS_JSON = JSON.stringify([
      { name: 'valid_name', transport: 'stdio' },
    ]);
    await expect(service.definitions()).rejects.toThrow('requires a stdio command');
  });

  it('resolves tools and their safety according to allowlist', () => {
    process.env.MCP_SERVERS_JSON = JSON.stringify([
      {
        name: 'test_server',
        transport: 'http',
        url: 'https://example.com/mcp',
        tools: {
          read: ['query_data'],
          write: ['modify_data'],
        },
      },
    ]);

    const readTool = service.resolve('mcp__test_server__query_data');
    expect(readTool).toBeDefined();
    expect(readTool?.remoteName).toBe('query_data');
    expect(readTool?.safety).toEqual({
      mode: 'read',
      proposalRequired: false,
    });

    const writeTool = service.resolve('mcp__test_server__modify_data');
    expect(writeTool).toBeDefined();
    expect(writeTool?.remoteName).toBe('modify_data');
    expect(writeTool?.safety).toEqual({
      mode: 'write',
      proposalRequired: true,
      ownerOnly: true,
    });

    const disallowedTool = service.resolve('mcp__test_server__unlisted_tool');
    expect(disallowedTool).toBeUndefined();

    const nonMcpTool = service.resolve('warn_user');
    expect(nonMcpTool).toBeUndefined();
  });

  it('caps oversized output', async () => {
    process.env.MCP_SERVERS_JSON = JSON.stringify([
      {
        name: 'srv',
        transport: 'http',
        url: 'https://example.com/mcp',
        tools: { read: ['echo'] },
      },
    ]);
    process.env.MCP_MAX_OUTPUT_CHARS = '1000';

    const mockClient = {
      callTool: jest.fn<any>().mockResolvedValue({
        largeString: 'a'.repeat(2000),
      }),
      close: jest.fn<any>().mockResolvedValue(undefined),
    };
    (service as any).clients.set('srv', mockClient);

    const result: any = await service.execute('mcp__srv__echo', {});
    expect(result.truncated).toBe(true);
    expect(result.content.length).toBe(1000);
  });

  it('cleans up all clients on module destroy', async () => {
    const mockClient1 = { close: jest.fn<any>().mockResolvedValue(undefined) };
    const mockClient2 = { close: jest.fn<any>().mockResolvedValue(undefined) };
    (service as any).clients.set('srv1', mockClient1);
    (service as any).clients.set('srv2', mockClient2);

    await service.onModuleDestroy();
    expect(mockClient1.close).toHaveBeenCalledTimes(1);
    expect(mockClient2.close).toHaveBeenCalledTimes(1);
    expect((service as any).clients.size).toBe(0);
  });
});
