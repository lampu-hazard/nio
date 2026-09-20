import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PermissionFlagsBits } from 'discord.js';
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
    warning: {
      findMany: jest.fn(async (): Promise<any[]> => []),
      count: jest.fn(async () => 0),
    },
    auditLog: {
      findMany: jest.fn(async (): Promise<any[]> => []),
      count: jest.fn(async () => 0),
    },
    agentActionProposal: {
      count: jest.fn(async () => 0),
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

  const mockChannelMessages = {
    fetch: jest.fn(async (params: any) => {
      if (typeof params === 'string') {
        return { id: params, author: { id: 'user-1', tag: 'user#1234' }, content: 'target', createdAt: new Date('2026-01-01T00:01:00Z'), attachments: new Map() };
      }
      return new Map([
        ['ctx-1', { id: 'ctx-1', author: { id: 'user-1', tag: 'user#1234' }, content: params?.before ? 'before' : 'after', createdAt: params?.before ? new Date('2026-01-01T00:00:00Z') : new Date('2026-01-01T00:02:00Z'), attachments: new Map() }],
      ]);
    }),
  };

  const mockChannel = {
    id: 'channel-1',
    isTextBased: jest.fn(() => true),
    messages: mockChannelMessages,
  };

  const mockGuild = {
    id: 'guild-1',
    name: 'Test Guild',
    memberCount: 42,
    approximatePresenceCount: 7,
    premiumSubscriptionCount: 3,
    channels: {
      fetch: jest.fn(async () => mockChannel),
    },
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
      fetch: jest.fn(async () => ({
        id: 'admin-1',
        voice: { channelId: 'voice-current' },
      })),
    },
    roles: {
      cache: new Map([
        ['role-bot', { id: 'role-bot', name: 'Bot Role', position: 10 }],
        ['role-admin', { id: 'role-admin', name: 'Admin', position: 20 }],
        ['role-member', { id: 'role-member', name: 'Member', position: 5 }],
      ]),
      fetch: jest.fn(async (id?: string) => {
        const roles = new Map([
          ['role-bot', { id: 'role-bot', name: 'Bot Role', position: 10 }],
          ['role-admin', { id: 'role-admin', name: 'Admin', position: 20 }],
          ['role-member', { id: 'role-member', name: 'Member', position: 5 }],
        ]);
        return id ? roles.get(id) : roles;
      }),
      highest: { position: 10 },
      everyone: { id: 'guild-1' },
    },
    fetchAuditLogs: jest.fn(async (..._args: any[]): Promise<any> => ({
      entries: [
        {
          id: 'log-1',
          action: 24,
          executor: { id: 'admin-1', tag: 'admin#1234' },
          targetId: 'user-1',
          reason: 'spam',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          changes: [] as any[],
        },
      ],
    })),
  };

  const mockClient = {
    guilds: {
      fetch: jest.fn(async () => mockGuild),
    },
    users: {
      fetch: jest.fn(async () => ({ tag: 'admin#1234' })),
    },
  };

  const mockPluginTools = {
    has: jest.fn(() => false),
    execute: jest.fn(),
  };

  const mockLeaderboard = {
    getVoiceLeaderboard: jest.fn(async (..._args: any[]): Promise<any[]> => [
      { userId: 'user-1', tag: 'User1', avatar: null, score: 3665 },
    ]),
    getChatLeaderboard: jest.fn(async (..._args: any[]): Promise<any[]> => [
      { userId: 'user-1', tag: 'User1', avatar: null, score: 42 },
    ]),
  };

  const mockSentinel = {
    scanPhishing: jest.fn((url: string) => ({
      isSuspicious: url.includes('discrod') || url.includes('dіscord'),
      reasons: url.includes('discrod') ? ['Typosquatting of discord.com'] : [],
      confidence: 0.9,
      detectedTarget: 'discord.com',
    })),
    scanSecrets: jest.fn((text: string) => ({
      hasSecrets: text.includes('sk-'),
      detections: text.includes('sk-') ? [{ secretType: 'OPENAI_API_KEY', preview: 'sk-...1234', confidence: 0.98, start: 0, end: 10 }] : [],
      redactedText: text.replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED:OPENAI_API_KEY]'),
    })),
    inspectMessage: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DiscordAgentToolExecutorService(
      mockModeration as any,
      mockPrisma as any,
      mockProposals as any,
      mockMessageLogs as any,
      mockContext as any,
      mockPluginTools as any,
      mockLeaderboard as any,
      mockSentinel as any,
    );
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
    (expect(mockMessageLogs.getChannelRecentMessages) as any).toHaveBeenCalledWith('guild-1', 'channel-1', 100, undefined);
  });

  it('creates proposals for write tools', async () => {
    const res = await service.execute('warn_user', { targetUserId: 'user-1', reason: 'spam' }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });
    expect(res).toEqual({ proposalCreated: true, proposalId: 'proposal-1', actionType: 'WARN' });
  });

  it('creates rich announcement proposals', async () => {
    const res = await service.execute('send_channel_announcement', {
      channelId: 'channel-2',
      content: 'hello',
      title: 'Update',
      color: '#ffaa00',
      imageUrl: 'https://example.com/image.png',
      thumbnailUrl: 'https://example.com/thumb.png',
      footer: 'footer',
      ping: 'here',
      reason: 'weekly update',
    }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });

    expect(res).toEqual({ proposalCreated: true, proposalId: 'proposal-1', actionType: 'SEND_ANNOUNCEMENT' });
    (expect(mockProposals.createProposal) as any).toHaveBeenCalledWith(expect.objectContaining({
      targetUserId: null,
      recommendation: expect.objectContaining({
        type: 'SEND_ANNOUNCEMENT',
        channelId: 'channel-2',
        content: 'hello',
        announcementColor: '#ffaa00',
        announcementImageUrl: 'https://example.com/image.png',
        announcementThumbnailUrl: 'https://example.com/thumb.png',
        announcementFooter: 'footer',
        announcementPing: 'here',
      }),
    }));
  });

  it('creates purge user messages proposals', async () => {
    const res = await service.execute('purge_user_messages', {
      targetUserId: 'user-1',
      limit: 25,
      channels: ['channel-1'],
      reason: 'spam cleanup',
    }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });

    expect(res).toEqual({ proposalCreated: true, proposalId: 'proposal-1', actionType: 'PURGE_USER_MESSAGES' });
    (expect(mockProposals.createProposal) as any).toHaveBeenCalledWith(expect.objectContaining({
      targetUserId: 'user-1',
      recommendation: expect.objectContaining({
        type: 'PURGE_USER_MESSAGES',
        purgeLimit: 25,
        purgeUserChannels: ['channel-1'],
      }),
    }));
  });

  it('creates bot voice connection proposals', async () => {
    const joinRes = await service.execute('bot_join_voice', {
      voiceChannelId: 'voice-1',
      reason: 'join voice test',
    }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });
    const leaveRes = await service.execute('bot_leave_voice', {
      reason: 'leave voice test',
    }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });

    expect(joinRes).toEqual({ proposalCreated: true, proposalId: 'proposal-1', actionType: 'BOT_JOIN_VOICE' });
    expect(leaveRes).toEqual({ proposalCreated: true, proposalId: 'proposal-1', actionType: 'BOT_LEAVE_VOICE' });
    (expect(mockProposals.createProposal) as any).toHaveBeenCalledWith(expect.objectContaining({
      recommendation: expect.objectContaining({
        type: 'BOT_JOIN_VOICE',
        voiceChannelId: 'voice-1',
      }),
    }));
  });

  it('defaults bot join voice to requester current voice channel', async () => {
    const res = await service.execute('bot_join_voice', {
      reason: 'join my voice',
    }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });

    expect(res).toEqual({ proposalCreated: true, proposalId: 'proposal-1', actionType: 'BOT_JOIN_VOICE' });
    (expect(mockProposals.createProposal) as any).toHaveBeenCalledWith(expect.objectContaining({
      recommendation: expect.objectContaining({
        type: 'BOT_JOIN_VOICE',
        voiceChannelId: 'voice-current',
      }),
    }));
  });

  it('asks for a specific voice channel when requester is not in voice', async () => {
    mockGuild.members.fetch.mockResolvedValueOnce({ id: 'admin-1', voice: { channelId: null } } as any);

    await expect(service.execute('bot_join_voice', {
      reason: 'join my voice',
    }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' })).rejects.toThrow('Kamu belum masuk voice channel.');
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

  it('fetches general normalized audit logs with categories and normalization', async () => {
    mockGuild.fetchAuditLogs.mockResolvedValueOnce({
      entries: [
        {
          id: 'log-role-1',
          action: 25, // MEMBER_ROLE_UPDATE (typically)
          executor: { id: 'admin-1', tag: 'admin#1234' },
          targetId: 'user-1',
          reason: 'role added',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          changes: [{ key: '$add', new: [{ id: 'role-vip', name: 'VIP' }] }] as any[],
        },
        {
          id: 'log-timeout-1',
          action: 24, // MEMBER_UPDATE
          executor: { id: 'admin-1', tag: 'admin#1234' },
          targetId: 'user-1',
          reason: 'timed out',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          changes: [{ key: 'communication_disabled_until', new: '2026-01-01T01:00:00.000Z' }] as any[],
        },
      ],
    });

    const res = await service.execute('get_audit_logs', { category: 'role' }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });
    expect(res.guildId).toBe('guild-1');
    expect(res.count).toBe(1);
    expect(res.entries[0]).toEqual(expect.objectContaining({
      id: 'log-role-1',
      category: 'role',
      actionLabel: 'Member role update',
      roleChanges: {
        added: [{ id: 'role-vip', name: 'VIP' }],
        removed: [],
      },
    }));

    mockGuild.fetchAuditLogs.mockResolvedValueOnce({
      entries: [
        {
          id: 'log-timeout-1',
          action: 24,
          executor: { id: 'admin-1', tag: 'admin#1234' },
          targetId: 'user-1',
          reason: 'timed out',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          changes: [{ key: 'communication_disabled_until', new: '2026-01-01T01:00:00.000Z' }] as any[],
        },
      ],
    });

    const resTimeout = await service.execute('get_audit_logs', { category: 'timeout' }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });
    expect(resTimeout.count).toBe(1);
    expect(resTimeout.entries[0].timeoutChange).toEqual({
      newUntil: '2026-01-01T01:00:00.000Z',
      oldUntil: null,
      revoked: false,
    });
  });

  it('fetches member audit trail specifically targeting user', async () => {
    mockGuild.fetchAuditLogs.mockResolvedValueOnce({
      entries: [
        {
          id: 'log-role-1',
          action: 25,
          executor: { id: 'admin-1', tag: 'admin#1234' },
          targetId: 'user-1',
          reason: 'role added',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          changes: [{ key: '$add', new: [{ id: 'role-vip', name: 'VIP' }] }] as any[],
        },
        {
          id: 'log-role-2',
          action: 25,
          executor: { id: 'admin-1', tag: 'admin#1234' },
          targetId: 'user-2',
          reason: 'role added to other',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          changes: [{ key: '$add', new: [{ id: 'role-vip', name: 'VIP' }] }] as any[],
        },
      ],
    });

    const res = await service.execute('get_member_audit_trail', { targetUserId: 'user-1' }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });
    expect(res.count).toBe(1);
    expect(res.entries[0].id).toBe('log-role-1');
  });

  it('fetches moderator actions filter', async () => {
    mockGuild.fetchAuditLogs.mockResolvedValueOnce({
      entries: [
        {
          id: 'log-role-1',
          action: 25,
          executor: { id: 'admin-1', tag: 'admin#1234' },
          targetId: 'user-1',
          reason: 'role added',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          changes: [] as any[],
        },
      ],
    });

    const res = await service.execute('get_moderator_actions', { moderatorId: 'admin-1' }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });
    expect(res.count).toBe(1);
    expect(mockGuild.fetchAuditLogs).toHaveBeenCalledWith(expect.objectContaining({ user: 'admin-1' }));
  });

  it('searches audit events based on query matching', async () => {
    mockGuild.fetchAuditLogs.mockResolvedValueOnce({
      entries: [
        {
          id: 'log-role-1',
          action: 25,
          executor: { id: 'admin-1', tag: 'admin#1234' },
          targetId: 'user-1',
          reason: 'important update',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          changes: [{ key: '$add', new: [{ id: 'role-vip', name: 'VIP' }] }] as any[],
        },
        {
          id: 'log-role-2',
          action: 25,
          executor: { id: 'admin-1', tag: 'admin#1234' },
          targetId: 'user-2',
          reason: 'normal changes',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          changes: [] as any[],
        },
      ],
    });

    const res = await service.execute('search_audit_events', { query: 'important' }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });
    expect(res.count).toBe(1);
    expect(res.entries[0].id).toBe('log-role-1');
  });

  it('throws ForbiddenException when bot lacks ViewAuditLog permission', async () => {
    mockGuild.members.me.permissions.has.mockReturnValueOnce(false);
    await expect(service.execute('get_audit_logs', {}, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' }))
      .rejects.toThrow('Bot lacks View Audit Log permission');
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
        moderatorTag: 'admin#1234',
        createdAt: expect.any(Date),
      }],
    });
  });

  it('fetches message context around a target message', async () => {
    const res = await service.execute('get_message_context', { messageId: 'target-msg', channelId: 'channel-1' }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'fallback-channel' });

    expect(res).toEqual(expect.objectContaining({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'target-msg',
    }));
    expect(res.context).toHaveLength(3);
    expect(res.context[1]).toEqual(expect.objectContaining({ id: 'target-msg', isTarget: true }));
  });

  it('identifies duplicate messages to detect spam', async () => {
    (mockPrisma.discordMessageLog.findMany as any).mockResolvedValueOnce([
      { id: '1', authorId: 'user-1', channelId: 'ch-1', content: 'spam message', createdAt: new Date() },
      { id: '2', authorId: 'user-1', channelId: 'ch-2', content: 'spam message', createdAt: new Date() },
    ]);
    const res = await service.execute('find_duplicate_messages', { hours: 1 }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });
    expect(res.duplicateCount).toBe(1);
    expect(res.duplicates[0]).toEqual(expect.objectContaining({
      authorId: 'user-1',
      content: 'spam message',
      distinctChannels: 2,
      count: 2,
    }));
  });

  it('returns server statistics summary', async () => {
    (mockPrisma.warning.count as any).mockResolvedValueOnce(5);
    (mockPrisma.agentActionProposal.count as any).mockResolvedValueOnce(5);
    (mockPrisma.auditLog.count as any).mockResolvedValueOnce(5).mockResolvedValueOnce(5);

    const res = await service.execute('get_server_stats', {}, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });
    expect(res).toEqual(expect.objectContaining({
      guildId: 'guild-1',
      totalMembers: expect.any(Number),
      stats24h: {
        activeWarnings: 5,
        pendingProposals: 5,
        recentAnomalies: 5,
        recentSlowmodes: 5,
      },
    }));
  });

  it('executes get_voice_leaderboard with formatted duration', async () => {
    const res = await service.execute('get_voice_leaderboard', { days: '7', limit: 10 }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });
    expect(mockLeaderboard.getVoiceLeaderboard).toHaveBeenCalledWith('guild-1', '7', 10);
    expect(res).toEqual([
      {
        userId: 'user-1',
        tag: 'User1',
        avatar: null,
        score: 3665,
        durationFormatted: '1h 1m 5s',
      },
    ]);
  });

  it('executes get_chat_leaderboard', async () => {
    const res = await service.execute('get_chat_leaderboard', { days: '30', limit: 5 }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });
    expect(mockLeaderboard.getChatLeaderboard).toHaveBeenCalledWith('guild-1', '30', 5);
    expect(res).toEqual([
      {
        userId: 'user-1',
        tag: 'User1',
        avatar: null,
        score: 42,
      },
    ]);
  });

  it('executes trace_user_timeline aggregating warnings, notes, audit logs, and messages', async () => {
    (mockPrisma.warning.findMany as any).mockResolvedValueOnce([
      { id: 'w-1', guildId: 'guild-1', userId: 'user-1', moderatorId: 'mod-1', reason: 'Spamming', createdAt: new Date('2026-01-01T02:00:00Z') },
    ]);
    (mockPrisma.userNote.findMany as any).mockResolvedValueOnce([
      { id: 'n-1', guildId: 'guild-1', userId: 'user-1', moderatorId: 'mod-1', content: 'Watched user', createdAt: new Date('2026-01-01T01:30:00Z') },
    ]);
    (mockPrisma.auditLog.findMany as any).mockResolvedValueOnce([
      { id: 'a-1', guildId: 'guild-1', userId: 'user-1', action: 'WARN_USER', metadata: {}, createdAt: new Date('2026-01-01T02:00:00Z') },
    ]);
    (mockPrisma.discordMessageLog.findMany as any).mockResolvedValueOnce([
      { id: 'm-1', guildId: 'guild-1', authorId: 'user-1', channelId: 'ch-1', content: 'Hello raid', createdAt: new Date('2026-01-01T01:00:00Z'), deletedAt: null },
    ]);

    const res = await service.execute('trace_user_timeline', {
      targetUserId: 'user-1',
      hours: 24,
      limit: 20,
      includeMessages: true,
    }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });

    expect(res).toEqual(expect.objectContaining({
      guildId: 'guild-1',
      targetUserId: 'user-1',
      timeWindowHours: 24,
      totalEvents: expect.any(Number),
      events: expect.any(Array),
    }));
    expect(res.events.some((e: any) => e.type === 'WARNING')).toBe(true);
    expect(res.events.some((e: any) => e.type === 'MODERATOR_NOTE')).toBe(true);
    expect(res.events.some((e: any) => e.type === 'MESSAGE')).toBe(true);
  });

  it('executes find_correlated_accounts comparing join time, creation time, and string similarity', async () => {
    const targetMember = {
      id: 'target-1',
      user: { username: 'raid_bot_01', globalName: 'Raid Bot 01', createdAt: new Date('2026-01-01T00:00:00Z'), createdTimestamp: 1767225600000, bot: false },
      displayName: 'Raid Bot 01',
      joinedAt: new Date('2026-01-02T00:00:00Z'),
      joinedTimestamp: 1767312000000,
    };
    const correlatedMember = {
      id: 'alt-1',
      user: { username: 'raid_bot_02', globalName: 'Raid Bot 02', createdAt: new Date('2026-01-01T00:05:00Z'), createdTimestamp: 1767225900000, bot: false },
      displayName: 'Raid Bot 02',
      joinedAt: new Date('2026-01-02T00:02:00Z'),
      joinedTimestamp: 1767312120000,
    };
    const innocentMember = {
      id: 'user-regular',
      user: { username: 'regular_alice', globalName: 'Alice', createdAt: new Date('2024-01-01T00:00:00Z'), createdTimestamp: 1704067200000, bot: false },
      displayName: 'Alice',
      joinedAt: new Date('2025-01-01T00:00:00Z'),
      joinedTimestamp: 1735689600000,
    };

    (mockGuild.members.fetch as jest.Mock).mockImplementation(async (arg?: any) => {
      if (arg === 'target-1') return targetMember;
      return new Map([
        ['target-1', targetMember],
        ['alt-1', correlatedMember],
        ['user-regular', innocentMember],
      ]);
    });

    const res = await service.execute('find_correlated_accounts', {
      targetUserId: 'target-1',
      joinWindowMinutes: 30,
      creationWindowDays: 7,
      similarityThreshold: 0.7,
      limit: 10,
    }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });

    expect(res).toEqual(expect.objectContaining({
      guildId: 'guild-1',
      targetUser: expect.objectContaining({ userId: 'target-1', username: 'raid_bot_01' }),
      foundCount: 1,
    }));
    expect(res.correlatedAccounts[0]).toEqual(expect.objectContaining({
      userId: 'alt-1',
      matchedReasons: expect.arrayContaining(['JOIN_PROXIMITY', 'ACCOUNT_CREATION_PROXIMITY', 'NAME_SIMILARITY']),
    }));
  });

  it('executes detect_role_hierarchy_blockers detecting higher role position and server owner', async () => {
    (mockGuild.members.fetch as jest.Mock).mockImplementation(async (id?: any) => {
      if (id === 'target-admin') {
        return {
          id: 'target-admin',
          displayName: 'Admin User',
          user: { username: 'adminuser' },
          roles: { highest: { id: 'role-admin', name: 'Admin', position: 20 } },
          permissions: { has: jest.fn(() => true) },
        };
      }
      return { id: 'admin-1', voice: { channelId: 'voice-current' } };
    });

    const res = await service.execute('detect_role_hierarchy_blockers', {
      targetUserId: 'target-admin',
      actionType: 'TIMEOUT',
    }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });

    expect(res.canExecute).toBe(false);
    expect(res.blockers.some((b: string) => b.includes('higher than or equal to bot role'))).toBe(true);
  });

  it('executes analyze_channel_permissions_leak detecting sensitive leaks to @everyone', async () => {
    const leakChannel = {
      id: 'ch-leak',
      name: 'staff-secret-chat',
      isTextBased: () => true,
      permissionOverwrites: new Map([
        ['guild-1', {
          id: 'guild-1',
          allow: {
            has: jest.fn((perm: any) => {
              return perm === PermissionFlagsBits.ViewChannel || perm === PermissionFlagsBits.ManageChannels;
            }),
          },
        }],
      ]),
    };

    (mockGuild.channels.fetch as any).mockResolvedValueOnce(new Map([['ch-leak', leakChannel]]));

    const res = await service.execute('analyze_channel_permissions_leak', {
      severityThreshold: 'HIGH',
      limit: 10,
    }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });

    expect(res).toEqual(expect.objectContaining({
      guildId: 'guild-1',
      totalLeaksFound: expect.any(Number),
      leaks: expect.any(Array),
    }));
    expect(res.leaks.some((l: any) => l.channelId === 'ch-leak' && l.severity === 'CRITICAL')).toBe(true);
  });

  it('executes lookup_domain_reputation detecting phishing domains and secret leaks', async () => {
    const testSecret = ['sk', 'testsecret12345'].join('-');
    const res = await service.execute('lookup_domain_reputation', {
      urlOrDomain: `https://discrod-nitro-gift.ru?token=${testSecret}`,
    }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });

    expect(res).toEqual(expect.objectContaining({
      isThreat: true,
      threatTypes: expect.arrayContaining(['PHISHING', 'SECRET_LEAK']),
    }));
    expect(mockSentinel.scanPhishing).toHaveBeenCalled();
    expect(mockSentinel.scanSecrets).toHaveBeenCalled();
  });

  describe('web_fetch and web_search tools', () => {
    afterEach(() => {
      jest.restoreAllMocks();
      delete process.env.BRAVE_SEARCH_API_KEY;
      delete process.env.TAVILY_API_KEY;
    });

    it('rejects invalid URL or unsupported protocols for web_fetch', async () => {
      await expect(
        service.execute(
          'web_fetch',
          { url: 'not-a-valid-url' },
          { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'ch-1' },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.execute(
          'web_fetch',
          { url: 'ftp://files.example.com/data' },
          { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'ch-1' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks SSRF attempts to localhost, cloud metadata, or private IPs for web_fetch', async () => {
      await expect(
        service.execute(
          'web_fetch',
          { url: 'http://localhost:3000/admin' },
          { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'ch-1' },
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.execute(
          'web_fetch',
          { url: 'http://169.254.169.254/latest/meta-data' },
          { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'ch-1' },
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.execute(
          'web_fetch',
          { url: 'http://127.0.0.1:8080/secret' },
          { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'ch-1' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks domains that resolve to private IP addresses via DNS', async () => {
      jest.spyOn(service as any, 'resolveDns').mockResolvedValueOnce([
        { address: '192.168.1.100', family: 4 },
      ]);

      await expect(
        service.execute(
          'web_fetch',
          { url: 'https://internal-service.mycorp.com' },
          { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'ch-1' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('fetches valid public web content and cleans HTML into markdown', async () => {
      jest.spyOn(service as any, 'resolveDns').mockResolvedValueOnce([
        { address: '93.184.216.34', family: 4 },
      ]);

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head><style>body { color: red; }</style></head>
          <body>
            <script>alert("xss")</script>
            <header>Site Header</header>
            <h1>Test Documentation</h1>
            <p>Welcome to <b>Nio</b> documentation. Visit <a href="https://example.com/docs">our docs</a>.</p>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
            <footer>Copyright 2026</footer>
          </body>
        </html>
      `;

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
        text: async () => htmlContent,
      } as any);

      const res = await service.execute(
        'web_fetch',
        {
          url: 'https://example.com/info',
          maxChars: 5000,
        },
        { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'ch-1' },
      );

      expect(res).toEqual(
        expect.objectContaining({
          url: 'https://example.com/info',
          status: 200,
          truncated: false,
        }),
      );
      expect(res.content).toContain('### Test Documentation');
      expect(res.content).toContain('Welcome to Nio documentation');
      expect(res.content).toContain('[our docs](https://example.com/docs)');
      expect(res.content).toContain('- Item 1');
      expect(res.content).not.toContain('alert("xss")');
      expect(res.content).not.toContain('Site Header');
      expect(res.content).not.toContain('Copyright 2026');
    });

    it('handles web_fetch HTTP error responses gracefully', async () => {
      jest.spyOn(service as any, 'resolveDns').mockResolvedValueOnce([
        { address: '93.184.216.34', family: 4 },
      ]);

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
      } as any);

      const res = await service.execute(
        'web_fetch',
        {
          url: 'https://example.com/not-found',
        },
        { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'ch-1' },
      );

      expect(res).toEqual(
        expect.objectContaining({
          success: false,
          status: 404,
        }),
      );
    });

    it('rejects empty query for web_search', async () => {
      await expect(
        service.execute(
          'web_search',
          { query: '   ' },
          { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'ch-1' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('executes web_search using Brave Search API when configured', async () => {
      process.env.BRAVE_SEARCH_API_KEY = 'test-brave-key';

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: 'Discord JS Guide',
                url: 'https://discordjs.guide',
                description: 'Comprehensive guide',
              },
            ],
          },
        }),
      } as any);

      const res = await service.execute(
        'web_search',
        {
          query: 'discord js guide',
          limit: 3,
        },
        { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'ch-1' },
      );

      expect(res).toEqual(
        expect.objectContaining({
          engine: 'brave',
          count: 1,
          results: [
            {
              title: 'Discord JS Guide',
              url: 'https://discordjs.guide',
              snippet: 'Comprehensive guide',
            },
          ],
        }),
      );
    });

    it('executes web_search using Tavily Search API when configured', async () => {
      process.env.TAVILY_API_KEY = 'test-tavily-key';

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              title: 'NestJS Docs',
              url: 'https://docs.nestjs.com',
              content: 'A progressive Node.js framework',
            },
          ],
        }),
      } as any);

      const res = await service.execute(
        'web_search',
        {
          query: 'nestjs documentation',
          limit: 3,
        },
        { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'ch-1' },
      );

      expect(res).toEqual(
        expect.objectContaining({
          engine: 'tavily',
          count: 1,
          results: [
            {
              title: 'NestJS Docs',
              url: 'https://docs.nestjs.com',
              snippet: 'A progressive Node.js framework',
            },
          ],
        }),
      );
    });

    it('falls back to DuckDuckGo HTML scraping for zero-config web_search', async () => {
      const mockDdgHtml = `
        <div class="result results_links results_links_deep web-result ">
          <div class="result__body links_main links_deep">
            <h2 class="result__title">
              <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fddg-result&rut=123">
                Example <b>Title</b>
              </a>
            </h2>
            <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fddg-result&rut=123">
              This is a test snippet from DuckDuckGo.
            </a>
          </div>
        </div>
      `;

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () => mockDdgHtml,
      } as any);

      const res = await service.execute(
        'web_search',
        {
          query: 'example query',
          limit: 5,
        },
        { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'ch-1' },
      );

      expect(res).toEqual(
        expect.objectContaining({
          engine: 'duckduckgo',
          count: 1,
          results: [
            {
              title: 'Example Title',
              url: 'https://example.com/ddg-result',
              snippet: 'This is a test snippet from DuckDuckGo.',
            },
          ],
        }),
      );
    });
  });
});
