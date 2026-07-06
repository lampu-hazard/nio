import { Test, TestingModule } from '@nestjs/testing';
import { DiscordAgentService } from './discord-agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordAgentContextService } from './discord-agent-context.service';
import { DiscordAgentToolExecutorService } from './discord-agent-tool-executor.service';
import { AgentActionProposalService } from './agent-action-proposal.service';
import { AgentActionRendererService } from './agent-action-renderer.service';

describe('DiscordAgentService loop', () => {
  let service: DiscordAgentService;

  const mockPrisma = {
    discordAgentSettings: {
      findUnique: jest.fn().mockResolvedValue({
        enabled: true,
        allowedUserIds: ['admin-1'],
        provider: 'gemini',
        model: 'gemini-2.5-flash',
      }),
    },
    agentInteractionLog: { create: jest.fn().mockResolvedValue({}) },
  };

  const mockExecutor = {
    execute: jest.fn(),
  };

  const mockProposals = {
    createProposal: jest.fn(),
  };

  const mockRenderer = {
    renderProposalMessage: jest.fn().mockReturnValue({ embeds: [], components: [] }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordAgentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DiscordAgentContextService, useValue: {} },
        { provide: DiscordAgentToolExecutorService, useValue: mockExecutor },
        { provide: AgentActionProposalService, useValue: mockProposals },
        { provide: AgentActionRendererService, useValue: mockRenderer },
      ],
    }).compile();

    service = module.get(DiscordAgentService);
  });

  it('runs tool execution loop and returns final reply', async () => {
    const mockResponses = [
      {
        candidates: [{
          content: {
            parts: [{
              functionCall: { name: 'get_user_warnings', args: { targetUserId: 'user-1' } }
            }]
          }
        }]
      },
      {
        candidates: [{
          content: {
            parts: [{ text: 'User has 0 warnings. No action needed.' }]
          }
        }]
      }
    ];

    let callCount = 0;
    const providerMock = {
      generate: jest.fn().mockImplementation(() => {
        const res = mockResponses[callCount];
        callCount++;
        return Promise.resolve(res);
      }),
    };
    jest.spyOn(service as any, 'getProvider').mockReturnValue(providerMock);
    mockExecutor.execute.mockResolvedValue([{ id: 'warn-1' }]);

    const result = await service.handleMention('guild-1', 'channel-1', 'admin-1', '@nio cek warnings user-1');
    expect(result.content).toBe('User has 0 warnings. No action needed.');
    expect(mockExecutor.execute).toHaveBeenCalledWith('get_user_warnings', { targetUserId: 'user-1' }, { guildId: 'guild-1', channelId: 'channel-1', requestedById: 'admin-1' });
  });
});
