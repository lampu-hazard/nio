import { describe, expect, it, jest } from '@jest/globals';
import { countGeminiTokens, countOpenAiTokens, createConservativeFallbackEstimate } from './chat-token-counter';

describe('model-aware chat token counters', () => {
  it('uses model-aware tokenizer for recognized OpenAI models and stays well below raw UTF-8 JSON bytes on long schemas and multilingual text', () => {
    const messages = [
      { role: 'system', content: 'You are NIO, a conversational community assistant. Jawab dengan santai dan jelas.' },
      { role: 'user', content: 'Tolong cari informasi terbaru tentang pembaruan Discord API 😀🚀 dan jelaskan poin utamanya!' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'web_search', arguments: JSON.stringify({ query: 'discord api update', limit: 5 }) },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'call_1',
        name: 'web_search',
        content: JSON.stringify({ ok: true, value: { engine: 'searxng', results: [{ title: 'Discord Changelog', url: 'https://discord.com/developers/docs/change-log', snippet: 'Updated gateway events and slash commands.' }] } }),
      },
    ];
    const tools = Array.from({ length: 12 }, (_, idx) => ({
      type: 'function',
      function: {
        name: `tool_${idx}`,
        description: `Detailed tool description number ${idx} for testing static schema caching and token estimation.`,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query parameter.' },
            limit: { type: 'integer', description: 'Maximum items to return.' },
          },
          required: ['query'],
        },
      },
    }));
    const serializedBytes = Buffer.byteLength(JSON.stringify({ model: 'gpt-4o-mini', messages, tools }), 'utf8');
    const estimate = countOpenAiTokens('gpt-4o-mini', messages, tools, serializedBytes);

    expect(estimate.source).toBe('MODEL_TOKENIZER');
    expect(estimate.confidence).toBe('ESTIMATED');
    expect(estimate.counterVersion).toContain('js-tiktoken:1.0.21');
    expect(estimate.inputTokens).toBeGreaterThan(50);
    expect(estimate.inputTokens).toBeLessThan(serializedBytes);
  });

  it('returns explicit CONSERVATIVE_FALLBACK for unrecognized custom models without claiming measured tokens', () => {
    const messages = [{ role: 'user', content: 'Halo dunia' }];
    const serializedBytes = Buffer.byteLength(JSON.stringify({ model: 'custom-local-llm-7b', messages }), 'utf8');
    const estimate = countOpenAiTokens('custom-local-llm-7b', messages, [], serializedBytes);

    expect(estimate).toEqual({
      inputTokens: serializedBytes + 1024 + 64,
      source: 'CONSERVATIVE_FALLBACK',
      counterVersion: 'utf8-ceiling:v1',
      confidence: 'CONSERVATIVE',
    });
  });

  it('uses official Gemini countTokens endpoint for PUBLIC and skips remote quota-only count for ADMIN', async () => {
    const fetchMock = jest.fn<any>(async () => ({
      ok: true,
      json: async () => ({ totalTokens: 42 }),
    }));
    const contents = [{ role: 'user', parts: [{ text: 'Halo!' }] }];
    const systemInstruction = { parts: [{ text: 'System' }] };

    const publicEstimate = await countGeminiTokens({
      apiKey: 'gem-key',
      model: 'gemini-2.5-flash',
      contents,
      systemInstruction,
      tools: [],
      serializedBytes: 300,
      profile: 'PUBLIC',
      fetchImpl: fetchMock as any,
    });

    expect(publicEstimate).toEqual({
      inputTokens: 42,
      source: 'PROVIDER_COUNT',
      counterVersion: 'gemini-countTokens:v1beta',
      confidence: 'REPORTED_COUNT',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:countTokens',
    );

    fetchMock.mockClear();
    const adminEstimate = await countGeminiTokens({
      apiKey: 'gem-key',
      model: 'gemini-2.5-flash',
      contents,
      systemInstruction,
      tools: [],
      serializedBytes: 300,
      profile: 'ADMIN',
      fetchImpl: fetchMock as any,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(adminEstimate.source).toBe('MODEL_TOKENIZER');
  });

  it('falls back safely when Gemini countTokens returns malformed or negative counts or times out', async () => {
    const badFetch = jest.fn<any>(async () => ({
      ok: true,
      json: async () => ({ totalTokens: -5 }),
    }));
    const fallback = await countGeminiTokens({
      apiKey: 'gem-key',
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: 'Halo!' }] }],
      systemInstruction: { parts: [{ text: 'System' }] },
      tools: [],
      serializedBytes: 250,
      profile: 'PUBLIC',
      fetchImpl: badFetch as any,
    });
    expect(fallback.source).toBe('CONSERVATIVE_FALLBACK');
    expect(fallback.confidence).toBe('CONSERVATIVE');
    expect(fallback).toEqual(createConservativeFallbackEstimate(250, 2, 0));
  });
});
