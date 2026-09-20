import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { OpenAiProvider } from './openai.provider';

describe('OpenAiProvider with Tool Calling', () => {
  let provider: OpenAiProvider;

  beforeEach(() => {
    provider = new OpenAiProvider('mock-openai-key', 'gpt-4o-mini');
  });

  it('handles regular text generation', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Hello from OpenAI!',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 6,
        total_tokens: 18,
      },
    };

    const globalFetch = global.fetch;
    let capturedUrl = '';
    let capturedPayload: any = null;
    let capturedHeaders: any = null;

    global.fetch = jest.fn(async (url: any, options: any) => {
      capturedUrl = String(url);
      capturedPayload = JSON.parse(options.body);
      capturedHeaders = options.headers;
      return {
        ok: true,
        json: async () => mockResponse,
      } as Response;
    });

    try {
      const response = await provider.generate({
        systemPrompt: 'You are helpful.',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'Hi!' }] }],
        tools: [],
      });

      expect(capturedUrl).toBe('https://api.openai.com/v1/chat/completions');
      expect(capturedHeaders['Authorization']).toBe('Bearer mock-openai-key');
      expect(capturedPayload.model).toBe('gpt-4o-mini');
      expect(capturedPayload.messages).toEqual([
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hi!' },
      ]);

      expect(response.message.role).toBe('assistant');
      expect(response.message.parts[0]).toEqual({
        type: 'text',
        text: 'Hello from OpenAI!',
      });
      expect(response.finishReason).toBe('stop');
      expect(response.usage).toEqual({
        promptTokens: 12,
        completionTokens: 6,
        totalTokens: 18,
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
    ).rejects.toThrow('OpenAI request requires at least one message.');
  });

  it('rejects when API key is missing on api.openai.com', async () => {
    const noKeyProvider = new OpenAiProvider('', 'gpt-4o');
    await expect(
      noKeyProvider.generate({
        systemPrompt: 'System',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'Hi' }] }],
        tools: [],
      }),
    ).rejects.toThrow('OpenAI API key is not configured.');
  });

  it('supports custom base URL without API key (e.g. local Ollama)', async () => {
    const customProvider = new OpenAiProvider('', 'llama3', 'http://localhost:11434/v1');
    const globalFetch = global.fetch;
    let capturedUrl = '';
    let capturedHeaders: any = null;

    global.fetch = jest.fn(async (url: any, options: any) => {
      capturedUrl = String(url);
      capturedHeaders = options.headers;
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'local response' } }],
        }),
      } as Response;
    });

    try {
      const result = await customProvider.generate({
        systemPrompt: '',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'Test' }] }],
        tools: [],
      });
      expect(capturedUrl).toBe('http://localhost:11434/v1/chat/completions');
      expect(capturedHeaders['Authorization']).toBeUndefined();
      expect(result.message.parts[0]).toEqual({ type: 'text', text: 'local response' });
    } finally {
      global.fetch = globalFetch;
    }
  });

  it('handles assistant requesting function tool calls', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_abc123',
                type: 'function',
                function: {
                  name: 'get_user_warnings',
                  arguments: '{"targetUserId":"999888"}',
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    };

    const globalFetch = global.fetch;
    let capturedPayload: any = null;

    global.fetch = jest.fn(async (_url: any, options: any) => {
      capturedPayload = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => mockResponse,
      } as Response;
    });

    try {
      const response = await provider.generate({
        systemPrompt: 'System',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'Check warnings' }] }],
        tools: [
          {
            name: 'get_user_warnings',
            description: 'Check warnings',
            parameters: {
              type: 'object',
              properties: { targetUserId: { type: 'string' } },
              required: ['targetUserId'],
            },
            safety: { mode: 'read', proposalRequired: false },
          },
        ],
      });

      expect(capturedPayload.tools).toEqual([
        {
          type: 'function',
          function: {
            name: 'get_user_warnings',
            description: 'Check warnings',
            parameters: {
              type: 'object',
              properties: { targetUserId: { type: 'string' } },
              required: ['targetUserId'],
            },
          },
        },
      ]);
      expect(capturedPayload.tool_choice).toBe('auto');

      expect(response.message.parts).toHaveLength(1);
      expect(response.message.parts[0]).toEqual({
        type: 'tool_call',
        id: 'call_abc123',
        name: 'get_user_warnings',
        arguments: { targetUserId: '999888' },
      });
      expect(response.finishReason).toBe('tool_calls');
    } finally {
      global.fetch = globalFetch;
    }
  });

  it('correctly maps tool_result history back to OpenAI tool messages', async () => {
    const globalFetch = global.fetch;
    let capturedPayload: any = null;

    global.fetch = jest.fn(async (_url: any, options: any) => {
      capturedPayload = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'The user has 0 warnings.',
              },
            },
          ],
        }),
      } as Response;
    });

    try {
      await provider.generate({
        systemPrompt: 'System',
        messages: [
          { role: 'user', parts: [{ type: 'text', text: 'Check warnings for 123' }] },
          {
            role: 'assistant',
            parts: [
              {
                type: 'tool_call',
                id: 'call_1',
                name: 'get_user_warnings',
                arguments: { targetUserId: '123' },
              },
            ],
          },
          {
            role: 'user',
            parts: [
              {
                type: 'tool_result',
                toolCallId: 'call_1',
                name: 'get_user_warnings',
                result: { ok: true, value: { warnings: [] } },
              },
            ],
          },
        ],
        tools: [],
      });

      expect(capturedPayload.messages).toEqual([
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Check warnings for 123' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'get_user_warnings',
                arguments: '{"targetUserId":"123"}',
              },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call_1',
          content: '{"ok":true,"value":{"warnings":[]}}',
        },
      ]);
    } finally {
      global.fetch = globalFetch;
    }
  });

  it('throws descriptive error on non-ok HTTP status', async () => {
    const globalFetch = global.fetch;
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    } as Response));

    try {
      await expect(
        provider.generate({
          systemPrompt: '',
          messages: [{ role: 'user', parts: [{ type: 'text', text: 'Hi' }] }],
          tools: [],
        }),
      ).rejects.toThrow('OpenAI API returned status 429: Rate limit exceeded');
    } finally {
      global.fetch = globalFetch;
    }
  });
});
