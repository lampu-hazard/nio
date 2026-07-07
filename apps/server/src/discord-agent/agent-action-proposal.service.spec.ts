import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { AgentActionProposalService } from './agent-action-proposal.service';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { StickersService } from '../stickers/stickers.service';

describe('AgentActionProposalService', () => {
  const mockStickers = {
    create: jest.fn(async () => ({})),
    delete: jest.fn(async () => ({})),
    loadCache: jest.fn(async () => ({})),
  };

  const mockPrisma = {
    agentActionProposal: {
      create: jest.fn(async () => ({ id: 'proposal-1' })),
      findUnique: jest.fn(async () => null as any),
      update: jest.fn(async () => ({})),
    },
    guildSettings: {
      upsert: jest.fn(),
    },
  };

  const mockModeration = {
    createWarning: jest.fn(async () => ({ id: 'warn-1' })),
  };

  let service: AgentActionProposalService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentActionProposalService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ModerationService, useValue: mockModeration },
        { provide: StickersService, useValue: mockStickers },
      ],
    }).compile();

    service = module.get(AgentActionProposalService);
  });

  it('creates a pending proposal with a 10 minute expiry', async () => {
    await service.createProposal({
      guildId: 'guild-1',
      channelId: 'channel-1',
      requestedById: 'admin-1',
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

  it('normalizes announcement proposals', async () => {
    await service.createProposal({
      guildId: 'guild-1',
      channelId: 'channel-1',
      requestedById: 'admin-1',
      targetUserId: null,
      recommendation: {
        type: 'SEND_ANNOUNCEMENT',
        reason: 'weekly update',
        content: 'hello server',
        title: 'weekly',
      },
    });

    const data = ((mockPrisma.agentActionProposal.create as any).mock.calls[0][0] as any).data;
    expect(data.actionType).toBe('SEND_ANNOUNCEMENT');
    expect(data.payload.content).toBe('hello server');
    expect(data.payload.title).toBe('weekly');
  });

  it('normalizes mass moderation proposals', async () => {
    await service.createProposal({
      guildId: 'guild-1',
      channelId: 'channel-1',
      requestedById: 'admin-1',
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

  it('cancels a pending proposal requested by the same user', async () => {
    mockPrisma.agentActionProposal.findUnique.mockResolvedValue({
      id: 'proposal-1',
      requestedById: 'admin-1',
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
});
