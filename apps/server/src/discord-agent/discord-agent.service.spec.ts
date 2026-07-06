import { Test, TestingModule } from '@nestjs/testing';
import { DiscordAgentService } from './discord-agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordAgentContextService } from './discord-agent-context.service';
import { AgentActionProposalService } from './agent-action-proposal.service';
import { AgentActionRendererService } from './agent-action-renderer.service';

describe('DiscordAgentService', () => {
  let service: DiscordAgentService;

  const mockPrisma = {
    discordAgentSettings: {
      findUnique: jest.fn().mockResolvedValue({
        enabled: true,
        allowedUserIds: ['user-authorized'],
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        systemPrompt: 'System override',
      }),
    },
    agentInteractionLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };

  const mockContext = {
    buildModContext: jest.fn().mockResolvedValue({ member: { id: 'target-1' } }),
  };

  const mockProposalService = {
    createProposal: jest.fn().mockResolvedValue({
      id: 'proposal-1',
      actionType: 'WARN',
      targetUserId: '456789012345678901',
      payload: { reason: 'Spam berulang' },
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    }),
  };

  const mockRendererService = {
    renderProposalMessage: jest.fn().mockReturnValue({
      embeds: [{ title: 'AI Action Proposal: WARN' }],
      components: [{ type: 1, components: [] }],
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordAgentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DiscordAgentContextService, useValue: mockContext },
        { provide: AgentActionProposalService, useValue: mockProposalService },
        { provide: AgentActionRendererService, useValue: mockRendererService },
      ],
    }).compile();

    service = module.get<DiscordAgentService>(DiscordAgentService);
  });

  it('ignores mentions from unauthorized users', async () => {
    const result = await service.handleMention('guild-1', 'channel-1', 'user-unauthorized', 'prompt');
    expect(result).toBeNull();
  });

  it('runs context extraction and provider call for authorized users (plain text)', async () => {
    const providerMock = { generate: jest.fn().mockResolvedValue('Agent response') };
    jest.spyOn(service as any, 'getProvider').mockReturnValue(providerMock);

    const originalClientId = process.env.DISCORD_CLIENT_ID;
    process.env.DISCORD_CLIENT_ID = '123456789012345678';
    try {
      const result = await service.handleMention('guild-1', 'channel-1', 'user-authorized', '<@123456789012345678> cek <@456789012345678901> lengkap');
      expect(result).toEqual({ content: 'Agent response' });
      expect(mockContext.buildModContext).toHaveBeenCalledWith('guild-1', '456789012345678901');
    } finally {
      process.env.DISCORD_CLIENT_ID = originalClientId;
    }
  });

  it('creates action proposals when Gemini returns structured JSON recommendations', async () => {
    const geminiJson = JSON.stringify({
      summary: 'User terlihat spam.',
      recommendations: [{ type: 'WARN', reason: 'Spam berulang' }],
    });
    const providerMock = {
      generate: jest.fn().mockResolvedValue(geminiJson),
    };
    jest.spyOn(service as any, 'getProvider').mockReturnValue(providerMock);

    const originalClientId = process.env.DISCORD_CLIENT_ID;
    process.env.DISCORD_CLIENT_ID = '123456789012345678';
    try {
      const result = await service.handleMention('guild-1', 'channel-1', 'user-authorized', '<@123456789012345678> cek <@456789012345678901>');
      expect(result.content).toContain('User terlihat spam.');
      expect(result.embeds).toBeDefined();
      expect(result.components).toBeDefined();
      expect(mockProposalService.createProposal).toHaveBeenCalledWith({
        guildId: 'guild-1',
        channelId: 'channel-1',
        requestedById: 'user-authorized',
        targetUserId: '456789012345678901',
        recommendation: { type: 'WARN', reason: 'Spam berulang', durationMinutes: undefined },
      });
    } finally {
      process.env.DISCORD_CLIENT_ID = originalClientId;
    }
  });
});
