import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { DiscordAgentToolExecutorService } from './discord-agent-tool-executor.service';
import { ModerationService } from '../moderation/moderation.service';
import { PrismaService } from '../prisma/prisma.service';
import { AgentActionProposalService } from './agent-action-proposal.service';
import { DiscordMessageLogService } from './discord-message-log.service';
import { DiscordAgentContextService } from './discord-agent-context.service';

describe('DiscordAgentToolExecutorService', () => {
  let service: DiscordAgentToolExecutorService;

  const mockModeration = {
    listWarnings: jest.fn(async () => [{ id: 'warn-1' }]),
  };

  const mockPrisma = {
    guildSettings: {
      findUnique: jest.fn(async () => ({ logChannelId: 'channel-1', messageDeleteLogChannelId: 'channel-del-1' })),
    },
    discordMessageLog: {
      findMany: jest.fn(async (): Promise<any[]> => []),
    },
    userNote: {
      create: jest.fn(async (params: any) => ({
        id: 'note-1',
        guildId: params.data.guildId,
        userId: params.data.userId,
        moderatorId: params.data.moderatorId,
        content: params.data.content,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      })),
      findMany: jest.fn(async () => [
        {
          id: 'note-1',
          content: 'some note',
          moderatorId: 'admin-1',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      ]),
    },
  };

  const mockProposals = {
    createProposal: jest.fn(async () => ({ id: 'proposal-1', actionType: 'WARN' })),
  };

  const mockMessageLogs = {
    getUserRecentMessages: jest.fn(async () => []),
    getChannelRecentMessages: jest.fn(async () => [{ id: 'msg-1', channelId: 'channel-1', authorId: 'user-1', content: 'hello', createdAt: new Date('2026-01-01T00:00:00Z'), editedAt: null, attachments: null }]),
    getDeletedMessages: jest.fn(async () => [{ id: 'deleted-1', channelId: 'channel-1', authorId: 'user-1', content: 'gone', createdAt: new Date('2026-01-01T00:00:00Z'), editedAt: null, deletedAt: new Date('2026-01-01T00:01:00Z'), attachments: null }]),
  };

  const mockContext = {
    buildModContext: jest.fn(async () => ({ member: { id: 'user-1' } })),
  };

  const mockGuild = {
    members: {
      me: {
        permissions: {
          has: jest.fn(() => true),
        },
        roles: {
          highest: { position: 10 },
        },
      },
      fetchMe: jest.fn(async () => ({
        permissions: {
          has: jest.fn(() => true),
        },
        roles: {
          highest: { position: 10 },
        },
      })),
    },
    fetchAuditLogs: jest.fn(async () => ({
      entries: [
        {
          id: 'log-1',
          action: 24,
          executor: { id: 'admin-1', tag: 'admin#1234' },
          targetId: 'user-1',
          reason: 'spam',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          changes: [],
        },
      ],
    })),
  };

  const mockClient = {
    guilds: {
      fetch: jest.fn(async () => mockGuild),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordAgentToolExecutorService,
        { provide: ModerationService, useValue: mockModeration },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AgentActionProposalService, useValue: mockProposals },
        { provide: DiscordMessageLogService, useValue: mockMessageLogs },
        { provide: DiscordAgentContextService, useValue: mockContext },
      ],
    }).compile();

    service = module.get(DiscordAgentToolExecutorService);
    service.setClient(mockClient as any);
  });

  it('executes read tools immediately', async () => {
    const res = await service.execute('get_user_warnings', { targetUserId: 'user-1' }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });
    expect(res).toEqual([{ id: 'warn-1' }]);
    (expect(mockModeration.listWarnings) as any).toHaveBeenCalledWith('guild-1', { search: 'user-1' });
  });

  it('reuses moderation context for member info', async () => {
    const res = await service.execute('get_member_info', { targetUserId: 'user-1' }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });
    expect(res).toEqual({ member: { id: 'user-1' } });
    (expect(mockContext.buildModContext) as any).toHaveBeenCalledWith('guild-1', 'user-1');
  });

  it('gets recent channel messages with a clamped limit', async () => {
    const res = await service.execute('get_channel_recent_messages', { channelId: 'channel-1', limit: 500 }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'fallback-channel' });
    expect(res).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'msg-1', content: 'hello' })]));
    (expect(mockMessageLogs.getChannelRecentMessages) as any).toHaveBeenCalledWith('guild-1', 'channel-1', 50, undefined);
  });

  it('creates proposals for write tools', async () => {
    const res = await service.execute('warn_user', { targetUserId: 'user-1', reason: 'spam' }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });
    expect(res).toEqual({ proposalCreated: true, proposalId: 'proposal-1', actionType: 'WARN' });
  });

  it('gets deleted message history with filters', async () => {
    const res = await service.execute('get_deleted_message_history', { targetUserId: 'user-1', limit: 10 }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });
    expect(res).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'deleted-1', deletedAt: new Date('2026-01-01T00:01:00Z') })]));
    (expect(mockMessageLogs.getDeletedMessages) as any).toHaveBeenCalledWith('guild-1', 10, { channelId: undefined, userId: 'user-1' });
  });

  it('creates role management proposals', async () => {
    const res = await service.execute('add_role_to_user', { targetUserId: 'user-1', roleId: 'role-1', reason: 'verified' }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });
    expect(res).toEqual({ proposalCreated: true, proposalId: 'proposal-1', actionType: 'ADD_ROLE' });
    (expect(mockProposals.createProposal) as any).toHaveBeenCalledWith(expect.objectContaining({
      targetUserId: 'user-1',
      recommendation: expect.objectContaining({ type: 'ADD_ROLE', roleId: 'role-1' }),
    }));
  });

  it('creates settings update proposals with only supported settings', async () => {
    await service.execute('update_server_settings', { reason: 'reduce spam', slowmodeEnabled: true, unsupported: 'ignored' }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });
    (expect(mockProposals.createProposal) as any).toHaveBeenCalledWith(expect.objectContaining({
      targetUserId: null,
      recommendation: expect.objectContaining({
        type: 'UPDATE_SETTINGS',
        reason: 'reduce spam',
        settings: { slowmodeEnabled: true },
      }),
    }));
  });

  it('fetches Discord audit logs', async () => {
    const res = await service.execute('get_discord_audit_logs', { limit: 10 }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });
    expect(res).toEqual([{
      id: 'log-1',
      action: 24,
      reason: 'spam',
      executorId: 'admin-1',
      executorTag: 'admin#1234',
      targetId: 'user-1',
      createdAt: expect.any(Date),
      changes: [],
    }]);
  });

  it('calculates user activity score based on logged messages', async () => {
    (mockPrisma.discordMessageLog.findMany as any).mockResolvedValueOnce([
      { id: '1', channelId: 'ch-1', createdAt: new Date(), deletedAt: null },
      { id: '2', channelId: 'ch-2', createdAt: new Date(), deletedAt: new Date() },
    ]);
    const res = await service.execute('check_user_activity_score', { targetUserId: 'user-1', days: 5 }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });
    expect(res).toEqual({
      targetUserId: 'user-1',
      days: 5,
      totalMessages: 2,
      activeDays: 1,
      uniqueChannels: 2,
      totalDeleted: 1,
      score: 22,
      level: 'LOW',
    });
  });

  it('adds user notes and lists them', async () => {
    const addRes = await service.execute('add_user_note', { targetUserId: 'user-1', content: 'good member' }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });
    expect(addRes).toEqual({
      success: true,
      note: {
        id: 'note-1',
        userId: 'user-1',
        moderatorId: 'admin-1',
        content: 'good member',
        createdAt: expect.any(Date),
      },
    });

    const getRes = await service.execute('get_user_notes', { targetUserId: 'user-1' }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });
    expect(getRes).toEqual({
      guildId: 'guild-1',
      userId: 'user-1',
      count: 1,
      notes: [{
        id: 'note-1',
        content: 'some note',
        moderatorId: 'admin-1',
        moderatorTag: 'admin-1',
        createdAt: expect.any(Date),
      }],
    });
  });
});
