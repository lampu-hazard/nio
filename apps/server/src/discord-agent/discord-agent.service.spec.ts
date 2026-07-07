import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { DiscordAgentService } from './discord-agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordAgentContextService } from './discord-agent-context.service';
import { DiscordAgentToolExecutorService } from './discord-agent-tool-executor.service';
import { AgentActionProposalService } from './agent-action-proposal.service';
import { AgentActionRendererService } from './agent-action-renderer.service';
import { ConversationMemoryService } from './conversation-memory.service';

describe('DiscordAgentService loop', () => {
  let service: DiscordAgentService;

  const mockPrisma = {
    discordAgentSettings: {
      findUnique: jest.fn(async () => ({
        enabled: true,
        allowedUserIds: ['admin-1'],
        provider: 'gemini',
        model: 'gemini-2.5-flash',
      })),
    },
    agentInteractionLog: { create: jest.fn(async () => ({})) },
  };

  const mockExecutor = {
    execute: jest.fn(async (): Promise<any> => null),
  };

  const mockProposals = {
    createProposal: jest.fn(),
  };

  const mockRenderer = {
    renderProposalMessage: jest.fn(() => ({ embeds: [], components: [] })),
  };

  const mockMemory = {
    loadHistory: jest.fn(async (_guildId?: string, _botMessageId?: string): Promise<any[]> => []),
    loadChannelHistory: jest.fn(async (_guildId?: string, _channelId?: string): Promise<any[]> => []),
    saveConversation: jest.fn(async (_guildId?: string, _botMessageId?: string, _turns?: any[]): Promise<void> => {}),
    saveChannelConversation: jest.fn(async (_guildId?: string, _channelId?: string, _turns?: any[]): Promise<void> => {}),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.DISCORD_CLIENT_ID = 'bot-1';
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordAgentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DiscordAgentContextService, useValue: {} },
        { provide: DiscordAgentToolExecutorService, useValue: mockExecutor },
        { provide: AgentActionProposalService, useValue: mockProposals },
        { provide: AgentActionRendererService, useValue: mockRenderer },
        { provide: ConversationMemoryService, useValue: mockMemory },
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
      generate: jest.fn(async () => {
        const res = mockResponses[callCount];
        callCount++;
        return res;
      }),
    };
    jest.spyOn(service as any, 'getProvider').mockReturnValue(providerMock);
    mockExecutor.execute.mockImplementation(async () => [{ id: 'warn-1' }]);

    const result = await service.handleMention('guild-1', 'channel-1', 'admin-1', '@nio cek warnings user-1');
    expect(result.content).toBe('User has 0 warnings. No action needed.');
    (expect(mockExecutor.execute) as any).toHaveBeenCalledWith('get_user_warnings', { targetUserId: 'user-1' }, { guildId: 'guild-1', channelId: 'channel-1', requestedById: 'admin-1' });
  });

  it('returns conversationTurns with new exchange on success', async () => {
    const providerMock = {
      generate: jest.fn(async () => ({
        candidates: [{ content: { parts: [{ text: 'Sure, here is the info.' }] } }],
      })),
    };
    jest.spyOn(service as any, 'getProvider').mockReturnValue(providerMock);

    const result = await service.handleMention('guild-1', 'channel-1', 'admin-1', '<@bot-1> tell me something');

    expect(result.conversationTurns).toHaveLength(1);
    expect(result.conversationTurns[0]).toEqual({
      userPrompt: 'tell me something',
      aiResponse: 'Sure, here is the info.',
      timestamp: expect.any(Number),
    });
  });

  it('does not return conversationTurns on error response', async () => {
    const providerMock = {
      generate: jest.fn(async () => { throw new Error('API down'); }),
    };
    jest.spyOn(service as any, 'getProvider').mockReturnValue(providerMock);

    const result = await service.handleMention('guild-1', 'channel-1', 'admin-1', '<@bot-1> hello');

    expect(result.content).toContain('⚠️');
    expect(result.conversationTurns).toBeUndefined();
  });

  it('loads previous turns when referencedBotMessageId is provided', async () => {
    (mockMemory.loadHistory as any).mockResolvedValueOnce([
      { userPrompt: 'previous question', aiResponse: 'previous answer', timestamp: 1000 },
    ]);

    const providerMock = {
      generate: jest.fn(async () => ({
        candidates: [{ content: { parts: [{ text: 'Continuing the conversation.' }] } }],
      })),
    };
    jest.spyOn(service as any, 'getProvider').mockReturnValue(providerMock);

    const result = await service.handleMention('guild-1', 'channel-1', 'admin-1', '<@bot-1> continue', 'prev-bot-msg-id');

    (expect(mockMemory.loadHistory) as any).toHaveBeenCalledWith('guild-1', 'prev-bot-msg-id');

    const generateCall = (providerMock.generate as any).mock.calls[0];
    const history = generateCall[2];
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: 'user', parts: [{ text: 'previous question' }] });
    expect(history[1]).toEqual({ role: 'model', parts: [{ text: 'previous answer' }] });

    expect(result.conversationTurns).toHaveLength(2);
    expect(result.conversationTurns[0].userPrompt).toBe('previous question');
    expect(result.conversationTurns[1].userPrompt).toBe('continue');
    expect(result.conversationTurns[1].aiResponse).toBe('Continuing the conversation.');
  });

  it('loads channel history for fresh mentions without referencedBotMessageId', async () => {
    (mockMemory.loadChannelHistory as any).mockResolvedValueOnce([
      { userPrompt: 'cek user target', aiResponse: 'target user info', timestamp: 1000 },
    ]);

    const providerMock = {
      generate: jest.fn(async () => ({
        candidates: [{ content: { parts: [{ text: 'I understand dia as the previous target.' }] } }],
      })),
    };
    jest.spyOn(service as any, 'getProvider').mockReturnValue(providerMock);

    const result = await service.handleMention('guild-1', 'channel-1', 'admin-1', '<@bot-1> kamu to dia');

    (expect(mockMemory.loadChannelHistory) as any).toHaveBeenCalledWith('guild-1', 'channel-1');
    expect(mockMemory.loadHistory).not.toHaveBeenCalled();

    const generateCall = (providerMock.generate as any).mock.calls[0];
    const history = generateCall[2];
    expect(history[0]).toEqual({ role: 'user', parts: [{ text: 'cek user target' }] });
    expect(history[1]).toEqual({ role: 'model', parts: [{ text: 'target user info' }] });
    expect(result.conversationTurns).toHaveLength(2);
  });

  it('starts fresh when loadHistory returns no turns', async () => {
    (mockMemory.loadHistory as any).mockResolvedValueOnce([]);

    const providerMock = {
      generate: jest.fn(async () => ({
        candidates: [{ content: { parts: [{ text: 'Fresh start.' }] } }],
      })),
    };
    jest.spyOn(service as any, 'getProvider').mockReturnValue(providerMock);

    const result = await service.handleMention('guild-1', 'channel-1', 'admin-1', '@nio hello', 'expired-msg-id');

    const generateCall = (providerMock.generate as any).mock.calls[0];
    const history = generateCall[2];
    expect(history).toHaveLength(0);
    expect(result.conversationTurns).toHaveLength(1);
  });
});
