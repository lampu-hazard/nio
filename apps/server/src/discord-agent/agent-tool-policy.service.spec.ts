import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PermissionFlagsBits } from 'discord.js';
import { AgentToolPolicyService } from './agent-tool-policy.service';

const publicContext = { guildId: 'guild', profile: 'PUBLIC' as const, channelId: 'channel', userId: 'member', requestedById: 'member' };
const adminContext = { ...publicContext, profile: 'ADMIN' as const };

describe('profile tool policy', () => {
  let service: AgentToolPolicyService;
  let allowedToolIds: string[];
  let granted: Set<bigint>;
  let visible: boolean;
  const access = { resolve: jest.fn<any>() };
  const plugins = { definitionsForGuild: jest.fn<any>(async () => []), list: jest.fn<any>(() => []) };
  const mcp = { definitions: jest.fn<any>(async () => []), resolve: jest.fn<any>() };

  beforeEach(() => {
    jest.clearAllMocks();
    allowedToolIds = ['get_user_warnings', 'get_channel_recent_messages', 'kick_user'];
    granted = new Set([PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ModerateMembers]);
    visible = true;
    access.resolve.mockImplementation(async () => ({ allowed: true, settings: { allowedToolIds } }));
    plugins.definitionsForGuild.mockResolvedValue([]);
    service = new AgentToolPolicyService(access as any, plugins as any, mcp as any);
    service.setClient({ guilds: { cache: new Map([['guild', {
      id: 'guild', ownerId: 'owner',
      members: { fetch: async () => ({ guild: { id: 'guild' }, permissions: { has: (flag: bigint) => granted.has(flag) } }) },
      channels: { fetch: async (id: string) => ({ id, guildId: 'guild', permissionsFor: () => ({ has: () => visible }) }) },
    }]]) } } as any);
  });

  it('never exposes or authorizes administrative tools for PUBLIC while allowing selected web_search and web_fetch without ManageGuild', async () => {
    granted = new Set();
    allowedToolIds.push('web_fetch', 'web_search');
    expect((await service.definitions(publicContext)).map((tool) => tool.name)).toEqual(['web_fetch', 'web_search']);
    await service.assertAllowed(publicContext, 'web_search', { query: 'nestjs' });
    await service.assertAllowed(publicContext, 'web_fetch', { url: 'https://example.com' });
    await expect(service.assertAllowed(publicContext, 'kick_user', {})).rejects.toThrow();
    await expect(service.assertAllowed(publicContext, 'get_user_warnings', {})).rejects.toThrow();
    expect(plugins.definitionsForGuild).not.toHaveBeenCalled();
    expect(mcp.definitions).not.toHaveBeenCalled();
  });

  it('filters before serialization and rechecks selection and admission at dispatch', async () => {
    expect((await service.definitions(adminContext)).map((tool) => tool.name)).toEqual(expect.arrayContaining(['get_user_warnings', 'get_channel_recent_messages', 'kick_user']));
    await service.assertAllowed(adminContext, 'kick_user', {});
    allowedToolIds = [];
    await expect(service.assertAllowed(adminContext, 'kick_user', {})).rejects.toThrow();
    allowedToolIds = ['kick_user'];
    access.resolve.mockResolvedValueOnce({ allowed: false, code: 'ROLE_DENIED' });
    await expect(service.assertAllowed(adminContext, 'kick_user', {})).rejects.toThrow();
  });

  it('requires moderation authority and source channel visibility for private reads', async () => {
    granted = new Set();
    await expect(service.assertAllowed(adminContext, 'get_user_warnings', {})).rejects.toThrow();
    granted.add(PermissionFlagsBits.ModerateMembers);
    await service.assertAllowed(adminContext, 'get_user_warnings', {});
    visible = false;
    await expect(service.assertAllowed(adminContext, 'get_channel_recent_messages', { channelId: 'private' })).rejects.toThrow();
  });

  it('maps provider names to stable extension identities without allowing unselected calls', async () => {
    allowedToolIds = ['plugin:tools:lookup'];
    plugins.definitionsForGuild.mockResolvedValue([{ pluginId: 'tools', name: 'lookup', description: 'Lookup', parameters: { type: 'object' }, safety: { mode: 'read', proposalRequired: false } }]);
    const [definition] = await service.definitions(adminContext);
    expect(await service.resolveCall(adminContext, definition.name, {})).toMatchObject({ id: 'plugin:tools:lookup', dispatchName: 'lookup', source: 'PLUGIN' });
    allowedToolIds = [];
    await expect(service.resolveCall(adminContext, definition.name, {})).rejects.toThrow();
  });

  it('rejects colliding provider names instead of overwriting tools', async () => {
    allowedToolIds = ['plugin:a-b:lookup', 'plugin:a_b:lookup'];
    plugins.definitionsForGuild.mockResolvedValue(['a-b', 'a_b'].map((pluginId) => ({ pluginId, name: 'lookup', description: 'Lookup', parameters: { type: 'object' }, safety: { mode: 'read', proposalRequired: false } })));
    await expect(service.definitions(adminContext)).rejects.toThrow('collision');
  });

  it('keeps owner-only extensions restricted even when selected', async () => {
    allowedToolIds = ['plugin:tools:write'];
    plugins.definitionsForGuild.mockResolvedValue([{ pluginId: 'tools', name: 'write', description: 'Write', parameters: { type: 'object' }, safety: { mode: 'write', proposalRequired: true, ownerOnly: true } }]);
    expect(await service.definitions(adminContext)).toEqual([]);
  });

  it('does not advertise plugin writes without a supported confirmation flow', async () => {
    allowedToolIds = ['plugin:tools:write'];
    plugins.definitionsForGuild.mockResolvedValue([{ pluginId: 'tools', name: 'write', description: 'Write', parameters: { type: 'object' }, safety: { mode: 'write', proposalRequired: true } }]);
    expect(await service.definitions(adminContext)).toEqual([]);
  });

  it('fails closed for forged requester identity, unknown classification and unselected extensions', async () => {
    await expect(service.definitions({ ...adminContext, requestedById: 'other' })).rejects.toThrow();
    allowedToolIds = ['unclassified', 'plugin:p:run', 'mcp:s:run'];
    await expect(service.assertAllowed(adminContext, 'unclassified', {})).rejects.toThrow();
    await expect(service.assertAllowed(adminContext, 'plugin:p:run', {})).rejects.toThrow();
    await expect(service.assertAllowed(adminContext, 'mcp:s:run', {})).rejects.toThrow();
  });

  it('returns profile-scoped catalog metadata with PUBLIC limited to web_search and web_fetch and ADMIN marking unsupported plugin writes unavailable', async () => {
    plugins.definitionsForGuild.mockResolvedValue([
      { pluginId: 'tools', name: 'lookup', description: 'Lookup', parameters: { type: 'object' }, safety: { mode: 'read', proposalRequired: false } },
      { pluginId: 'tools', name: 'mutate', description: 'Mutate', parameters: { type: 'object' }, safety: { mode: 'write', proposalRequired: true } },
    ]);
    const publicCatalog = await (service as any).catalog({ guildId: 'guild', profile: 'PUBLIC' });
    expect(publicCatalog.map((item: any) => item.id)).toEqual(['web_fetch', 'web_search']);
    expect(publicCatalog.every((item: any) => item.available === true && item.source === 'BUILTIN')).toBe(true);

    const adminCatalog = await (service as any).catalog({ guildId: 'guild', profile: 'ADMIN' });
    expect(adminCatalog).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'web_search', available: true, source: 'BUILTIN' }),
      expect.objectContaining({ id: 'kick_user', available: true, source: 'BUILTIN', mode: 'write' }),
      expect.objectContaining({ id: 'plugin:tools:lookup', available: true, source: 'PLUGIN', mode: 'read' }),
      expect.objectContaining({ id: 'plugin:tools:mutate', available: false, source: 'PLUGIN', mode: 'write' }),
    ]));
  });

  it('fetches guild member and context channel at most once across multi-tool definitions and single-tool resolveCall', async () => {
    const membersFetch = jest.fn<any>(async () => ({
      guild: { id: 'guild' },
      permissions: { has: (flag: bigint) => granted.has(flag) },
    }));
    const channelsFetch = jest.fn<any>(async (id: string) => ({
      id,
      guildId: 'guild',
      permissionsFor: () => ({ has: () => visible }),
    }));
    service.setClient({
      guilds: {
        cache: new Map([
          [
            'guild',
            {
              id: 'guild',
              ownerId: 'owner',
              members: { fetch: membersFetch },
              channels: { fetch: channelsFetch },
            },
          ],
        ]),
      },
    } as any);

    allowedToolIds = [
      'web_search',
      'web_fetch',
      'get_user_warnings',
      'get_channel_recent_messages',
      'get_server_settings',
      'kick_user',
      'ban_user',
      'timeout_user',
    ];

    const defs = await service.definitions(adminContext);
    expect(defs.length).toBe(8);
    expect(membersFetch).toHaveBeenCalledTimes(1);
    expect(channelsFetch).toHaveBeenCalledTimes(1);

    membersFetch.mockClear();
    channelsFetch.mockClear();

    const entry = await service.resolveCall(adminContext, 'web_search', { query: 'midterm election' });
    expect(entry.id).toBe('web_search');
    expect(membersFetch).toHaveBeenCalledTimes(1);
    expect(channelsFetch).toHaveBeenCalledTimes(1);
  });
});
