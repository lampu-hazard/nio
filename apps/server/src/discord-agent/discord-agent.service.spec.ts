import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DiscordAgentService } from './discord-agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordAgentContextService } from './discord-agent-context.service';
import { DiscordAgentToolExecutorService } from './discord-agent-tool-executor.service';
import { AgentActionProposalService } from './agent-action-proposal.service';
import { AgentActionRendererService } from './agent-action-renderer.service';
import { ConversationMemoryService } from './conversation-memory.service';
import { PluginToolRegistryService } from '../plugins/plugin-tool-registry.service';
import { McpToolService } from './mcp-tool.service';
import { AiGenerateRequest, AiGenerateResult } from './interfaces/ai-provider.interface';

describe('DiscordAgentService loop', () => {
  let service: DiscordAgentService;

  const mockPrisma = {
    discordAgentSettings: {
      findUnique: jest.fn<any>(async () => ({
        enabled: true,
        allowedUserIds: ['admin-1'],
        provider: 'gemini',
        model: 'gemini-2.5-flash',
      })),
    },
    agentInteractionLog: {
      create: jest.fn<any>(async (params: any) => {
        expect(params.data).toHaveProperty('promptTokens');
        expect(params.data).toHaveProperty('completionTokens');
        expect(params.data).toHaveProperty('totalTokens');
        return {};
      }),
    },
    agentActionProposal: {
      findUnique: jest.fn<any>(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        guildId: 'guild-1',
        channelId: 'channel-1',
        requestedById: 'admin-1',
        targetUserId: 'user-1',
        status: 'PENDING',
        recommendation: { type: 'WARN_USER', reason: 'Spamming' },
      })),
    },
  };

  const mockExecutor = {
    execute: jest.fn<any>(async (): Promise<any> => null),
  };

  const mockProposals = {
    createProposal: jest.fn<any>(async () => ({ id: 'prop-mcp-1' })),
  };

  const mockRenderer = {
    renderProposalMessage: jest.fn<any>(() => ({ embeds: [{ title: 'Proposal Card' }], components: [] })),
  };

  const mockMemory = {
    loadHistory: jest.fn<any>(async (_guildId?: string, _botMessageId?: string): Promise<any[]> => []),
    saveConversation: jest.fn<any>(async (_guildId?: string, _botMessageId?: string, _turns?: any[]): Promise<void> => {}),
  };

  const mockPluginTools = {
    definitionsForGuild: jest.fn<any>(async () => []),
  };

  const mockMcpTools = {
    definitions: jest.fn<any>(async () => []),
    resolve: jest.fn<any>(),
    execute: jest.fn<any>(async () => ({ temp: 28 })),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockMcpTools.resolve.mockReset();
    mockMcpTools.resolve.mockReturnValue(undefined);
    mockExecutor.execute.mockReset();
    mockExecutor.execute.mockResolvedValue(null);
    process.env.DISCORD_CLIENT_ID = 'bot-1';
    delete process.env.OWNER_DISCORD_ID;

    service = new DiscordAgentService(
      mockPrisma as unknown as PrismaService,
      {} as unknown as DiscordAgentContextService,
      mockExecutor as unknown as DiscordAgentToolExecutorService,
      mockProposals as unknown as AgentActionProposalService,
      mockRenderer as unknown as AgentActionRendererService,
      mockMemory as unknown as ConversationMemoryService,
      mockPluginTools as unknown as PluginToolRegistryService,
      mockMcpTools as unknown as McpToolService,
    );
  });

  it('returns null before AI work when requester is not allowed', async () => {
    mockPrisma.discordAgentSettings.findUnique.mockResolvedValueOnce({
      enabled: true,
      allowedUserIds: ['admin-1'],
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });
    const providerMock = { generate: jest.fn<any>() };
    jest.spyOn(service as any, 'getProvider').mockReturnValue(providerMock);

    const result = await service.handleMention('guild-1', 'channel-1', 'regular-1', '<@bot-1> hello');

    expect(result).toBeNull();
    expect(providerMock.generate).not.toHaveBeenCalled();
    expect(mockPrisma.agentInteractionLog.create).not.toHaveBeenCalled();
  });

  it('returns guidance message when prompt is empty after removing bot mention', async () => {
    const providerMock = { generate: jest.fn<any>() };
    jest.spyOn(service as any, 'getProvider').mockReturnValue(providerMock);

    const result = await service.handleMention('guild-1', 'channel-1', 'admin-1', '<@bot-1>');

    expect(result).toEqual({
      content: '⚠️ Sebutkan pertanyaan atau instruksi setelah mention saya.',
    });
    expect(providerMock.generate).not.toHaveBeenCalled();
  });

  it('runs tool execution loop and returns final reply accumulating tokens', async () => {
    const mockResponses: AiGenerateResult[] = [
      {
        message: {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'call-1',
              name: 'get_user_warnings',
              arguments: { targetUserId: 'user-1' },
            },
          ],
        },
        finishReason: 'tool_calls',
        usage: {
          promptTokens: 150,
          completionTokens: 30,
          totalTokens: 180,
        },
      },
      {
        message: {
          role: 'assistant',
          parts: [{ type: 'text', text: 'User has 0 warnings. No action needed.' }],
        },
        finishReason: 'stop',
        usage: {
          promptTokens: 250,
          completionTokens: 20,
          totalTokens: 270,
        },
      },
    ];

    let callCount = 0;
    const providerMock = {
      generate: jest.fn<any>(async () => {
        const res = mockResponses[callCount];
        callCount++;
        return res;
      }),
    };
    jest.spyOn(service as any, 'getProvider').mockReturnValue(providerMock);
    mockExecutor.execute.mockImplementation(async () => [{ id: 'warn-1' }]);

    const result = await service.handleMention('guild-1', 'channel-1', 'admin-1', '@nio cek warnings user-1');
    expect(result.content).toBe('User has 0 warnings. No action needed.');
    expect(mockExecutor.execute).toHaveBeenCalledWith(
      'get_user_warnings',
      { targetUserId: 'user-1' },
      { guildId: 'guild-1', channelId: 'channel-1', requestedById: 'admin-1' },
    );
    expect(mockPrisma.agentInteractionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          promptTokens: 400,
          completionTokens: 50,
          totalTokens: 450,
        }),
      }),
    );
  });

  it('returns conversationTurns with new exchange on success and logs token usage', async () => {
    const providerMock = {
      generate: jest.fn<any>(async (): Promise<AiGenerateResult> => ({
        message: {
          role: 'assistant',
          parts: [{ type: 'text', text: 'Sure, here is the info.' }],
        },
        finishReason: 'stop',
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
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
    expect(mockPrisma.agentInteractionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        }),
      }),
    );
  });

  it('does not return conversationTurns on error response', async () => {
    const providerMock = {
      generate: jest.fn<any>(async () => {
        throw new Error('API down');
      }),
    };
    jest.spyOn(service as any, 'getProvider').mockReturnValue(providerMock);

    const result = await service.handleMention('guild-1', 'channel-1', 'admin-1', '<@bot-1> hello');

    expect(result.content).toContain('⚠️');
    expect(result.conversationTurns).toBeUndefined();
  });

  it('loads previous turns when referencedBotMessageId is provided', async () => {
    mockMemory.loadHistory.mockResolvedValueOnce([
      { userPrompt: 'previous question', aiResponse: 'previous answer', timestamp: 1000 },
    ]);

    const providerMock = {
      generate: jest.fn<any>(async (): Promise<AiGenerateResult> => ({
        message: {
          role: 'assistant',
          parts: [{ type: 'text', text: 'Continuing the conversation.' }],
        },
        finishReason: 'stop',
      })),
    };
    jest.spyOn(service as any, 'getProvider').mockReturnValue(providerMock);

    const result = await service.handleMention('guild-1', 'channel-1', 'admin-1', '<@bot-1> continue', 'prev-bot-msg-id');

    expect(mockMemory.loadHistory).toHaveBeenCalledWith('guild-1', 'prev-bot-msg-id');

    const generateCall = (providerMock.generate as any).mock.calls[0][0] as AiGenerateRequest;
    const messages = generateCall.messages;
    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ role: 'user', parts: [{ type: 'text', text: 'previous question' }] });
    expect(messages[1]).toEqual({ role: 'assistant', parts: [{ type: 'text', text: 'previous answer' }] });
    expect(messages[2]).toEqual({ role: 'user', parts: [{ type: 'text', text: 'continue' }] });

    expect(result.conversationTurns).toHaveLength(2);
    expect(result.conversationTurns[0].userPrompt).toBe('previous question');
    expect(result.conversationTurns[1].userPrompt).toBe('continue');
    expect(result.conversationTurns[1].aiResponse).toBe('Continuing the conversation.');
  });

  it('starts fresh for mentions without referencedBotMessageId', async () => {
    const providerMock = {
      generate: jest.fn<any>(async (): Promise<AiGenerateResult> => ({
        message: {
          role: 'assistant',
          parts: [{ type: 'text', text: 'Fresh response.' }],
        },
        finishReason: 'stop',
      })),
    };
    jest.spyOn(service as any, 'getProvider').mockReturnValue(providerMock);

    const result = await service.handleMention('guild-1', 'channel-1', 'admin-1', '<@bot-1> kamu to dia');

    expect(mockMemory.loadHistory).not.toHaveBeenCalled();

    const generateCall = (providerMock.generate as any).mock.calls[0][0] as AiGenerateRequest;
    const messages = generateCall.messages;
    expect(messages).toHaveLength(1);
    expect(result.conversationTurns).toHaveLength(1);
  });

  it('injects referenced message context when replyContext is provided', async () => {
    const providerMock = {
      generate: jest.fn<any>(async (): Promise<AiGenerateResult> => ({
        message: {
          role: 'assistant',
          parts: [{ type: 'text', text: 'I see the replied message.' }],
        },
        finishReason: 'stop',
      })),
    };
    jest.spyOn(service as any, 'getProvider').mockReturnValue(providerMock);

    const replyContext = {
      id: 'ref-1',
      channelId: 'channel-1',
      authorId: 'user-2',
      authorTag: 'user#5678',
      content: 'please help me',
      createdAt: new Date('2026-07-10T12:00:00Z'),
      attachments: [{ name: 'file.png', url: 'https://example.com/file.png' }],
    };

    const result = await service.handleMention(
      'guild-1',
      'channel-1',
      'admin-1',
      'check this',
      undefined,
      replyContext,
    );

    expect(result.content).toBe('I see the replied message.');

    const generateCall = (providerMock.generate as any).mock.calls[0][0] as AiGenerateRequest;
    const userPrompt = generateCall.messages[0].parts[0];
    expect(userPrompt.type).toBe('text');
    if (userPrompt.type === 'text') {
      expect(userPrompt.text).toContain('Konteks pesan yang di-reply:');
      expect(userPrompt.text).toContain('Author: user#5678 (user-2)');
      expect(userPrompt.text).toContain('please help me');
      expect(userPrompt.text).toContain('file.png: https://example.com/file.png');
      expect(userPrompt.text).toContain('Permintaan moderator:\ncheck this');
    }

    expect(result.conversationTurns).toHaveLength(1);
    expect(result.conversationTurns[0].userPrompt).toBe('check this');
  });

  it('marks bot-owner authorization as granted in the system prompt', async () => {
    process.env.OWNER_DISCORD_ID = 'admin-1';
    const providerMock = {
      generate: jest.fn<any>(async (): Promise<AiGenerateResult> => ({
        message: {
          role: 'assistant',
          parts: [{ type: 'text', text: 'Ready.' }],
        },
        finishReason: 'stop',
      })),
    };
    jest.spyOn(service as any, 'getProvider').mockReturnValue(providerMock);

    await service.handleMention('guild-1', 'channel-1', 'admin-1', '<@bot-1> check status');

    const generateCall = (providerMock.generate as any).mock.calls[0][0] as AiGenerateRequest;
    const systemPrompt = generateCall.systemPrompt;
    expect(systemPrompt).toContain('Requesting Discord user ID: admin-1');
    expect(systemPrompt).toContain('Bot owner authorization: granted');
  });

  it('marks bot-owner authorization as not granted for other users', async () => {
    process.env.OWNER_DISCORD_ID = 'owner-1';
    const providerMock = {
      generate: jest.fn<any>(async (): Promise<AiGenerateResult> => ({
        message: {
          role: 'assistant',
          parts: [{ type: 'text', text: 'Ready.' }],
        },
        finishReason: 'stop',
      })),
    };
    jest.spyOn(service as any, 'getProvider').mockReturnValue(providerMock);

    await service.handleMention('guild-1', 'channel-1', 'admin-1', '<@bot-1> check status');

    const generateCall = (providerMock.generate as any).mock.calls[0][0] as AiGenerateRequest;
    const systemPrompt = generateCall.systemPrompt;
    expect(systemPrompt).toContain('Requesting Discord user ID: admin-1');
    expect(systemPrompt).toContain('Bot owner authorization: not granted');
  });

  it('creates proposal cards for write tools and renders embeds', async () => {
    const mockResponses: AiGenerateResult[] = [
      {
        message: {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'call-write-1',
              name: 'warn_user',
              arguments: { targetUserId: 'user-1', reason: 'Spamming' },
            },
          ],
        },
        finishReason: 'tool_calls',
      },
      {
        message: {
          role: 'assistant',
          parts: [{ type: 'text', text: 'Saya telah menyiapkan proposal peringatan untuk user-1.' }],
        },
        finishReason: 'stop',
      },
    ];

    let callIndex = 0;
    const providerMock = {
      generate: jest.fn<any>(async () => mockResponses[callIndex++]),
    };
    jest.spyOn(service as any, 'getProvider').mockReturnValue(providerMock);

    mockExecutor.execute.mockImplementation(async () => ({
      proposalCreated: true,
      proposalId: 'prop-1',
      actionType: 'WARN_USER',
    }));

    const result = await service.handleMention('guild-1', 'channel-1', 'admin-1', '<@bot-1> tolong warn user-1');

    expect(result.content).toBe('Saya telah menyiapkan proposal peringatan untuk user-1.');
    expect(result.embeds).toBeDefined();
    expect(result.embeds).toHaveLength(1);
    expect(result.embeds[0].title).toBe('Proposal Card');
    expect(mockExecutor.execute).toHaveBeenCalledWith(
      'warn_user',
      { targetUserId: 'user-1', reason: 'Spamming' },
      { guildId: 'guild-1', channelId: 'channel-1', requestedById: 'admin-1' },
    );
  });

  it('creates MCP write proposal when tool has mode write', async () => {
    mockMcpTools.resolve.mockReturnValue({
      config: { name: 'backup_service' },
      remoteName: 'run_backup',
      safety: { mode: 'write', proposalRequired: true, ownerOnly: true },
    });

    const mockResponses: AiGenerateResult[] = [
      {
        message: {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'call-mcp-write',
              name: 'mcp__backup_service__run_backup',
              arguments: { target: 'all' },
            },
          ],
        },
        finishReason: 'tool_calls',
      },
      {
        message: {
          role: 'assistant',
          parts: [{ type: 'text', text: 'Proposal MCP backup telah dibuat.' }],
        },
        finishReason: 'stop',
      },
    ];

    let callIndex = 0;
    const providerMock = {
      generate: jest.fn<any>(async () => mockResponses[callIndex++]),
    };
    jest.spyOn(service as any, 'getProvider').mockReturnValue(providerMock);

    const result = await service.handleMention('guild-1', 'channel-1', 'admin-1', '<@bot-1> jalankan backup');

    expect(result.content).toBe('Proposal MCP backup telah dibuat.');
    expect(mockProposals.createProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild-1',
        channelId: 'channel-1',
        requestedById: 'admin-1',
        recommendation: expect.objectContaining({
          type: 'MCP_TOOL_CALL',
          mcpServer: 'backup_service',
          mcpTool: 'run_backup',
          mcpArguments: { target: 'all' },
        }),
      }),
    );
  });

  it('terminates loop when identical tool call signature is repeated 3 times', async () => {
    const repeatedResponse: AiGenerateResult = {
      message: {
        role: 'assistant',
        parts: [
          {
            type: 'tool_call',
            id: 'call-repeat',
            name: 'get_user_warnings',
            arguments: { targetUserId: 'user-1' },
          },
        ],
      },
      finishReason: 'tool_calls',
    };

    const providerMock = {
      generate: jest.fn<any>(async () => repeatedResponse),
    };
    jest.spyOn(service as any, 'getProvider').mockReturnValue(providerMock);
    mockExecutor.execute.mockImplementation(async () => []);

    await service.handleMention('guild-1', 'channel-1', 'admin-1', '<@bot-1> loop test');

    // It should terminate and not run more than 3 calls
    expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
    // On the 3rd call, repetition is detected and loop terminates
  });

  describe('getProvider', () => {
    it('returns OpenAiProvider when provider is openai or openai-compatible', () => {
      const getProvider = (service as any).getProvider.bind(service);
      const openaiProvider = getProvider('openai', 'gpt-4o');
      expect(openaiProvider.constructor.name).toBe('OpenAiProvider');

      const compatibleProvider = getProvider('openai-compatible', 'custom-model');
      expect(compatibleProvider.constructor.name).toBe('OpenAiProvider');

      const groqProvider = getProvider('groq', 'llama-3.3-70b-versatile');
      expect(groqProvider.constructor.name).toBe('OpenAiProvider');
    });

    it('returns GeminiProvider when provider is gemini', () => {
      const getProvider = (service as any).getProvider.bind(service);
      const geminiProvider = getProvider('gemini', 'gemini-2.5-flash');
      expect(geminiProvider.constructor.name).toBe('GeminiProvider');
    });

    it('throws when provider is unknown', () => {
      const getProvider = (service as any).getProvider.bind(service);
      expect(() => getProvider('unknown-ai', 'model-x')).toThrow('Unsupported AI provider: unknown-ai');
    });
  });
});
