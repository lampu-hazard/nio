import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { GeminiProvider } from './gemini.provider';

describe('GeminiProvider with Tool Calling', () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    provider = new GeminiProvider('mock-api-key', 'gemini-2.5-flash');
  });

  it('handles regular text generation', async () => {
    const mockResponse = {
      candidates: [
        { content: { parts: [{ text: 'plain text response' }] } },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    };
    const globalFetch = global.fetch;
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => mockResponse,
    } as Response));

    try {
      const response = await provider.generate({
        systemPrompt: 'System',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'User' }] }],
        tools: [],
      });
      expect(response.message.role).toBe('assistant');
      expect(response.message.parts[0]).toEqual({
        type: 'text',
        text: 'plain text response',
      });
      expect(response.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });
    } finally {
      global.fetch = globalFetch;
    }
  });

  it('rejects requests without messages', async () => {
    await expect(
      provider.generate({
        systemPrompt: 'System',
        messages: [],
        tools: [],
      }),
    ).rejects.toThrow('Gemini request requires at least one message.');
  });

  it('handles model requesting function call', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: 'get_user_warnings',
                  args: { targetUserId: '123' },
                },
              },
            ],
          },
        },
      ],
    };
    const globalFetch = global.fetch;
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => mockResponse,
    } as Response));

    try {
      const response = await provider.generate({
        systemPrompt: 'System',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'Check user warnings' }] }],
        tools: [
          {
            name: 'get_user_warnings',
            description: 'Get user warnings',
            parameters: { type: 'object', properties: {} },
            safety: { mode: 'read', proposalRequired: false },
          },
        ],
      });
      expect(response.message.parts[0]).toEqual({
        type: 'tool_call',
        id: 'get_user_warnings:0',
        name: 'get_user_warnings',
        arguments: { targetUserId: '123' },
      });
    } finally {
      global.fetch = globalFetch;
    }
  });
});
