import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { AgentActionProposalService } from './agent-action-proposal.service';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { StickersService } from '../stickers/stickers.service';
import { PermissionFlagsBits } from 'discord.js';

describe('AgentActionProposalService', () => {
  const mockStickers = {
    create: jest.fn(async () => ({})),
    delete: jest.fn(async () => ({})),
    loadCache: jest.fn(async () => ({})),
  };

  const mockPrisma = {
    agentActionProposal: {
      create: jest.fn(async () => ({ id: 'proposal-1' })),
      findUnique: jest.fn<any>(async () => null as any),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    guildSettings: {
      upsert: jest.fn(),
    },
  };

  const mockModeration = {
    createWarning: jest.fn(async () => ({ id: 'warn-1' })),
  };

  let service: AgentActionProposalService;
  const mockPolicy = { assertAllowed: jest.fn<any>(async () => undefined) };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AgentActionProposalService(
      mockPrisma as any,
      mockModeration as any,
      mockStickers as any,
      undefined,
      mockPolicy as any,
    );
  });

  it('rejects unscoped or public proposals before persistence', async () => {
    const input = { guildId: 'guild-1', channelId: 'channel-1', requestedById: 'admin-1', recommendation: { type: 'WARN', reason: 'spam' } };
    await expect(service.createProposal(input as any)).rejects.toThrow();
    await expect(service.createProposal({ ...input, profile: 'PUBLIC', originToolId: 'warn_user' } as any)).rejects.toThrow();
    expect(mockPrisma.agentActionProposal.create).not.toHaveBeenCalled();
  });

  it.each(['legacy', 'public', 'wrong guild', 'revoked requester'])('blocks %s proposals before mutation', async (reason) => {
    const policy = { assertAllowed: jest.fn<any>(async () => { if (reason === 'revoked requester') throw new Error('Admission revoked'); }) };
    service = new AgentActionProposalService(mockPrisma as any, mockModeration as any, mockStickers as any, undefined, policy as any);
    service.setClient({} as any);
    mockPrisma.agentActionProposal.findUnique.mockResolvedValueOnce({
      id: 'proposal-1', guildId: reason === 'wrong guild' ? 'other-guild' : 'guild-1',
      channelId: 'channel-1', requestedById: 'admin-1', targetUserId: 'target-1',
      profile: reason === 'public' ? 'PUBLIC' : 'ADMIN', originToolId: reason === 'legacy' ? null : 'warn_user',
      status: 'PENDING', actionType: 'WARN', payload: { reason: 'spam' }, expiresAt: new Date(Date.now() + 60000),
    });
    await expect(service.approveAndExecute('proposal-1', 'admin-1', 'guild-1')).rejects.toThrow();
    expect(mockModeration.createWarning).not.toHaveBeenCalled();
    expect(mockPrisma.agentActionProposal.update).not.toHaveBeenCalled();
  });

  it('rechecks admission before approving a batch envelope', async () => {
    const policy = { assertAllowed: jest.fn<any>(async () => { throw new Error('Admission revoked'); }) };
    service = new AgentActionProposalService(mockPrisma as any, mockModeration as any, mockStickers as any, undefined, policy as any);
    service.setClient({} as any);
    mockPrisma.agentActionProposal.findUnique.mockResolvedValueOnce({ id: 'batch-1', guildId: 'guild-1', profile: 'ADMIN',
      originToolId: 'warn_user', channelId: 'channel-1', requestedById: 'admin-1', status: 'PENDING', actionType: 'BATCH',
      payload: { proposalIds: ['sub-1'] }, expiresAt: new Date(Date.now() + 60000) });
    await expect(service.approveAndExecute('batch-1', 'admin-1', 'guild-1')).rejects.toThrow('Admission revoked');
    expect(mockPrisma.agentActionProposal.update).not.toHaveBeenCalled();
  });

  it('rejects a requester whose role no longer outranks the moderation target', async () => {
    mockPrisma.agentActionProposal.findUnique.mockResolvedValueOnce({ id: 'kick-1', guildId: 'guild-1', profile: 'ADMIN',
      originToolId: 'kick_user', channelId: 'channel-1', requestedById: 'requester', targetUserId: 'target', status: 'PENDING',
      actionType: 'KICK', payload: {}, expiresAt: new Date(Date.now() + 60000) });
    const kick = jest.fn<any>();
    const member = (id: string) => ({ id, permissions: { has: () => true }, roles: { highest: { comparePositionTo: () => id === 'requester' ? -1 : 1 } }, kick });
    service.setClient({ guilds: { fetch: async () => ({ id: 'guild-1', ownerId: 'owner',
      members: { fetch: async (input: any) => member(typeof input === 'string' ? input : input.user), fetchMe: async () => member('bot') } }) } } as any);
    await expect(service.approveAndExecute('kick-1', 'approver', 'guild-1')).rejects.toThrow('hierarchy');
    expect(kick).not.toHaveBeenCalled();
  });

  it('rejects a stored action that does not match its authorized origin tool', async () => {
    service.setClient({} as any);
    mockPrisma.agentActionProposal.findUnique.mockResolvedValueOnce({ id: 'mismatch', guildId: 'guild-1', profile: 'ADMIN',
      originToolId: 'get_user_warnings', channelId: 'channel-1', requestedById: 'admin-1', status: 'PENDING',
      actionType: 'BAN', payload: {}, expiresAt: new Date(Date.now() + 60000) });
    await expect(service.approveAndExecute('mismatch', 'admin-1', 'guild-1')).rejects.toThrow('origin');
    expect(mockPrisma.agentActionProposal.update).not.toHaveBeenCalled();
  });

  it('rejects mismatched proposal origins at creation', async () => {
    await expect(service.createProposal({ guildId: 'guild-1', channelId: 'channel-1', requestedById: 'admin-1', profile: 'ADMIN',
      originToolId: 'get_user_warnings', recommendation: { type: 'BAN', reason: 'spam' } })).rejects.toThrow('origin');
    expect(mockPrisma.agentActionProposal.create).not.toHaveBeenCalled();
  });

  it('creates a pending proposal with a 10 minute expiry', async () => {
    await service.createProposal({
      guildId: 'guild-1',
      channelId: 'channel-1',
      requestedById: 'admin-1',
      profile: 'ADMIN',
      originToolId: 'warn_user',
      targetUserId: 'target-1',
      recommendation: { type: 'WARN', reason: 'Spam berulang' },
    });

    expect(mockPrisma.agentActionProposal.create).toHaveBeenCalledTimes(1);
    const data = ((mockPrisma.agentActionProposal.create as any).mock.calls[0][0] as any).data;
    expect(data.status).toBe('PENDING');
    expect(data.actionType).toBe('WARN');
    expect(data.targetUserId).toBe('target-1');
  });

  it('normalizes settings update proposals', async () => {
    await service.createProposal({
      guildId: 'guild-1',
      channelId: 'channel-1',
      requestedById: 'admin-1',
      profile: 'ADMIN',
      originToolId: 'update_server_settings',
      targetUserId: null,
      recommendation: {
        type: 'UPDATE_SETTINGS',
        reason: 'tighten moderation',
        settings: {
          slowmodeEnabled: true,
          slowmodeIntervalBusy: 999999,
          anomalyEnforcementMode: 'invalid-mode',
        },
      },
    });

    const data = ((mockPrisma.agentActionProposal.create as any).mock.calls[0][0] as any).data;
    expect(data.targetUserId).toBeNull();
    expect(data.actionType).toBe('UPDATE_SETTINGS');
    expect(data.payload.settings).toEqual({
      slowmodeEnabled: true,
      slowmodeIntervalBusy: 21600,
      anomalyEnforcementMode: 'AUDIT_ONLY',
    });
  });

  it('normalizes purge proposals', async () => {
    await service.createProposal({
      guildId: 'guild-1',
      channelId: 'channel-1',
      requestedById: 'admin-1',
      profile: 'ADMIN',
      originToolId: 'purge_channel_messages',
      targetUserId: 'target-1',
      recommendation: {
        type: 'PURGE',
        reason: 'spam cleanup',
        purgeLimit: 500,
        purgeChannelId: 'channel-2',
        purgeTargetUserId: 'target-1',
      },
    });

    const data = ((mockPrisma.agentActionProposal.create as any).mock.calls[0][0] as any).data;
    expect(data.actionType).toBe('PURGE');
    expect(data.payload.limit).toBe(100);
    expect(data.payload.channelId).toBe('channel-2');
    expect(data.payload.targetUserId).toBe('target-1');
  });

  it('normalizes role management proposals', async () => {
    await service.createProposal({
      guildId: 'guild-1',
      channelId: 'channel-1',
      requestedById: 'admin-1',
      profile: 'ADMIN',
      originToolId: 'add_role_to_user',
      targetUserId: 'target-1',
      recommendation: {
        type: 'ADD_ROLE',
        reason: 'verified',
        roleId: 'role-1',
      },
    });

    const data = ((mockPrisma.agentActionProposal.create as any).mock.calls[0][0] as any).data;
    expect(data.actionType).toBe('ADD_ROLE');
    expect(data.payload.roleId).toBe('role-1');
  });

  it('normalizes warning revocation proposals', async () => {
    await service.createProposal({
      guildId: 'guild-1',
      channelId: 'channel-1',
      requestedById: 'admin-1',
      profile: 'ADMIN',
      originToolId: 'revoke_warning',
      targetUserId: null,
      recommendation: {
        type: 'REVOKE_WARNING',
        reason: 'appeal accepted',
        warningId: 'warn-1',
      },
    });

    const data = ((mockPrisma.agentActionProposal.create as any).mock.calls[0][0] as any).data;
    expect(data.actionType).toBe('REVOKE_WARNING');
    expect(data.payload.warningId).toBe('warn-1');
  });

  it('normalizes lockdown and unlock proposals', async () => {
    await service.createProposal({
      guildId: 'guild-1',
      channelId: 'channel-1',
      requestedById: 'admin-1',
      profile: 'ADMIN',
      originToolId: 'lockdown_channel',
      targetUserId: null,
      recommendation: {
        type: 'LOCKDOWN',
        reason: 'raid ongoing',
        channelId: 'channel-2',
      },
    });

    const data = ((mockPrisma.agentActionProposal.create as any).mock.calls[0][0] as any).data;
    expect(data.actionType).toBe('LOCKDOWN');
    expect(data.payload.channelId).toBe('channel-2');
  });

  it('normalizes slowmode proposals', async () => {
    await service.createProposal({
      guildId: 'guild-1',
      channelId: 'channel-1',
      requestedById: 'admin-1',
      profile: 'ADMIN',
      originToolId: 'set_channel_slowmode',
      targetUserId: null,
      recommendation: {
        type: 'SET_SLOWMODE',
        reason: 'slow down',
        slowmodeSeconds: 15,
      },
    });

    const data = ((mockPrisma.agentActionProposal.create as any).mock.calls[0][0] as any).data;
    expect(data.actionType).toBe('SET_SLOWMODE');
    expect(data.payload.slowmodeSeconds).toBe(15);
  });

  it('normalizes rich announcement proposals', async () => {
    await service.createProposal({
      guildId: 'guild-1',
      channelId: 'channel-1',
      requestedById: 'admin-1',
      profile: 'ADMIN',
      originToolId: 'send_channel_announcement',
      targetUserId: null,
      recommendation: {
        type: 'SEND_ANNOUNCEMENT',
        reason: 'weekly update',
        content: 'hello server',
        title: 'weekly',
        announcementColor: 'ffaa00',
        announcementImageUrl: 'https://example.com/image.png',
        announcementThumbnailUrl: 'https://example.com/thumb.png',
        announcementFooter: 'footer text',
        announcementPing: 'here',
      },
    });

    const data = ((mockPrisma.agentActionProposal.create as any).mock.calls[0][0] as any).data;
    expect(data.actionType).toBe('SEND_ANNOUNCEMENT');
    expect(data.payload.content).toBe('hello server');
    expect(data.payload.title).toBe('weekly');
    expect(data.payload.announcementColor).toBe('#ffaa00');
    expect(data.payload.announcementImageUrl).toBe('https://example.com/image.png');
    expect(data.payload.announcementThumbnailUrl).toBe('https://example.com/thumb.png');
    expect(data.payload.announcementFooter).toBe('footer text');
    expect(data.payload.announcementPing).toBe('here');
  });

  it('normalizes purge user messages proposals', async () => {
    await service.createProposal({
      guildId: 'guild-1',
      channelId: 'channel-1',
      requestedById: 'admin-1',
      profile: 'ADMIN',
      originToolId: 'purge_user_messages',
      targetUserId: 'target-1',
      recommendation: {
        type: 'PURGE_USER_MESSAGES',
        reason: 'mass spam cleanup',
        purgeLimit: 500,
        purgeUserChannels: ['channel-2', 'channel-2', ' channel-3 '],
      },
    });

    const data = ((mockPrisma.agentActionProposal.create as any).mock.calls[0][0] as any).data;
    expect(data.actionType).toBe('PURGE_USER_MESSAGES');
    expect(data.payload.targetUserId).toBe('target-1');
    expect(data.payload.limit).toBe(100);
    expect(data.payload.channels).toEqual(['channel-2', 'channel-3']);
  });

  it('normalizes mass moderation proposals', async () => {
    await service.createProposal({
      guildId: 'guild-1',
      channelId: 'channel-1',
      requestedById: 'admin-1',
      profile: 'ADMIN',
      originToolId: 'mass_moderation_action',
      targetUserId: null,
      recommendation: {
        type: 'MASS_BAN',
        reason: 'raiders',
        targetUserIds: ['user-1', 'user-2'],
      },
    });

    const data = ((mockPrisma.agentActionProposal.create as any).mock.calls[0][0] as any).data;
    expect(data.actionType).toBe('MASS_BAN');
    expect(data.payload.targetUserIds).toEqual(['user-1', 'user-2']);
  });

  it('normalizes manage sticker proposals', async () => {
    await service.createProposal({
      guildId: 'guild-1',
      channelId: 'channel-1',
      requestedById: 'admin-1',
      profile: 'ADMIN',
      originToolId: 'manage_server_sticker',
      targetUserId: null,
      recommendation: {
        type: 'MANAGE_STICKER',
        reason: 'add trigger',
        stickerAction: 'ADD',
        stickerName: 'cool',
        stickerUrl: 'https://example.com/cool.png',
      },
    });

    const data = ((mockPrisma.agentActionProposal.create as any).mock.calls[0][0] as any).data;
    expect(data.actionType).toBe('MANAGE_STICKER');
    expect(data.payload.stickerAction).toBe('ADD');
    expect(data.payload.stickerName).toBe('cool');
    expect(data.payload.stickerUrl).toBe('https://example.com/cool.png');
  });

  it('normalizes MCP tool call proposals', async () => {
    await service.createProposal({
      guildId: 'guild-1',
      channelId: 'channel-1',
      requestedById: 'admin-1',
      profile: 'ADMIN',
      originToolId: 'mcp:deploy-srv:deploy_app',
      targetUserId: null,
      recommendation: {
        type: 'MCP_TOOL_CALL',
        reason: 'execute deploy',
        mcpServer: 'deploy-srv',
        mcpTool: 'deploy_app',
        mcpArguments: { branch: 'main' },
      },
    });

    const data = ((mockPrisma.agentActionProposal.create as any).mock.calls[0][0] as any).data;
    expect(data.actionType).toBe('MCP_TOOL_CALL');
    expect(data.payload.mcpServer).toBe('deploy-srv');
    expect(data.payload.mcpTool).toBe('deploy_app');
    expect(data.payload.mcpArguments).toEqual({ branch: 'main' });
  });

  it('rejects MCP tool call approval if approver is not bot owner', async () => {
    process.env.OWNER_DISCORD_ID = 'owner-123';
    mockPrisma.agentActionProposal.findUnique.mockResolvedValue({
      id: 'proposal-mcp',
      guildId: 'guild-1',
      channelId: 'channel-1',
      requestedById: 'admin-1',
      profile: 'ADMIN',
      originToolId: 'mcp:srv:tool',
      status: 'PENDING',
      actionType: 'MCP_TOOL_CALL',
      payload: { mcpServer: 'srv', mcpTool: 'tool' },
      expiresAt: new Date(Date.now() + 60_000),
    });

    service.setClient({ guilds: { fetch: jest.fn() } } as any);

    await expect(service.approveAndExecute('proposal-mcp', 'not-owner', 'guild-1')).rejects.toThrow(
      'Only the bot owner can approve external MCP tool calls.',
    );
  });

  it('cancels a pending proposal requested by the same user', async () => {
    mockPrisma.agentActionProposal.findUnique.mockResolvedValue({
      id: 'proposal-1',
      requestedById: 'admin-1',
      profile: 'ADMIN',
      originToolId: 'warn_user',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await service.cancelProposal('proposal-1', 'admin-1');
    expect(result.ok).toBe(true);
    (expect(mockPrisma.agentActionProposal.update) as any).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      data: { status: 'CANCELLED' },
    });
  });

  it('creates a batch proposal', async () => {
    (mockPrisma.agentActionProposal.create as any).mockResolvedValueOnce({ id: 'batch-1' });

    const batch = await service.createBatchProposal({
      guildId: 'guild-1',
      channelId: 'channel-1',
      requestedById: 'admin-1',
      profile: 'ADMIN',
      originToolId: 'warn_user',
      proposalIds: ['sub-1', 'sub-2'],
      reason: 'Batch role updates',
    });

    expect(batch.id).toBe('batch-1');
    const data = ((mockPrisma.agentActionProposal.create as any).mock.calls[0][0] as any).data;
    expect(data.actionType).toBe('BATCH');
    expect(data.payload.proposalIds).toEqual(['sub-1', 'sub-2']);
    expect(data.payload.reason).toBe('Batch role updates');
  });

  it('cancels batch proposal and cascades cancellation to sub-proposals', async () => {
    (mockPrisma.agentActionProposal.findUnique as any).mockResolvedValueOnce({
      id: 'batch-1',
      requestedById: 'admin-1',
      profile: 'ADMIN',
      originToolId: 'warn_user',
      status: 'PENDING',
      actionType: 'BATCH',
      payload: { proposalIds: ['sub-1', 'sub-2'] },
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await service.cancelProposal('batch-1', 'admin-1');
    expect(result.ok).toBe(true);
    (expect(mockPrisma.agentActionProposal.update) as any).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: { status: 'CANCELLED' },
    });
    (expect(mockPrisma.agentActionProposal.updateMany) as any).toHaveBeenCalledWith({
      where: {
        id: { in: ['sub-1', 'sub-2'] },
        status: 'PENDING',
      },
      data: { status: 'CANCELLED' },
    });
  });

  it('approves and executes batch proposal sequentially', async () => {
    const proposals = [
      {
        id: 'batch-1',
        guildId: 'guild-1',
        channelId: 'channel-1',
        requestedById: 'admin-1',
      profile: 'ADMIN',
      originToolId: 'warn_user',
        status: 'PENDING',
        actionType: 'BATCH',
        payload: { proposalIds: ['sub-1', 'sub-2'] },
        expiresAt: new Date(Date.now() + 60_000),
      },
      {
        id: 'sub-1',
        guildId: 'guild-1',
        channelId: 'channel-1',
        requestedById: 'admin-1',
      profile: 'ADMIN',
      originToolId: 'warn_user',
        targetUserId: 'target-1',
        status: 'PENDING',
        actionType: 'WARN',
        payload: { reason: 'Warn 1' },
        expiresAt: new Date(Date.now() + 60_000),
      },
      {
        id: 'sub-2',
        guildId: 'guild-1',
        channelId: 'channel-1',
        requestedById: 'admin-1',
      profile: 'ADMIN',
      originToolId: 'warn_user',
        targetUserId: 'target-1',
        status: 'PENDING',
        actionType: 'WARN',
        payload: { reason: 'Warn 2' },
        expiresAt: new Date(Date.now() + 60_000),
      },
    ];
    mockPrisma.agentActionProposal.findUnique.mockImplementation(async ({ where }: any) => proposals.find((proposal) => proposal.id === where.id));

    const mockMember = {
      id: 'target-1',
      permissions: { has: () => true },
      roles: { highest: { comparePositionTo: () => 1 } },
    };
    const mockApprover = {
      id: 'admin-1',
      permissions: { has: () => true },
      roles: { highest: { comparePositionTo: () => 2 } },
    };
    const mockGuild = {
      id: 'guild-1',
      members: {
        fetch: jest.fn(async (input: any) => ((typeof input === 'string' ? input : input.user) === 'admin-1' ? mockApprover : mockMember)),
        fetchMe: async () => ({
          permissions: { has: () => true },
          roles: { highest: { comparePositionTo: () => 3 } },
        }),
      },
    };

    service.setClient({
      guilds: {
        fetch: jest.fn(async () => mockGuild),
      },
    } as any);

    const result = await service.approveAndExecute('batch-1', 'admin-1', 'guild-1');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Batch executed: 2/2 actions succeeded.');
    expect(mockModeration.createWarning).toHaveBeenCalledTimes(2);
  });
});
