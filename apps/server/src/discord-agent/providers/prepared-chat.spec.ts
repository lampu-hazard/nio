import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { OpenAiProvider } from './openai.provider';
import { GeminiProvider } from './gemini.provider';
import { AiGenerateRequest } from '../interfaces/ai-provider.interface';

const request: AiGenerateRequest = { systemPrompt: 'System 猫', tools: [], messages: [
  { role: 'user', parts: [{ type: 'text', text: 'Hello\n"world"' }] },
  { role: 'assistant', parts: [{ type: 'tool_call', id: 'a', name: 'lookup', arguments: { value: '😀' } }] },
  { role: 'user', parts: [{ type: 'tool_result', toolCallId: 'a', name: 'lookup', result: { ok: true, value: 'history' } }] },
] };

describe('prepared provider calls', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it.each([128, 2048, 8192])('serializes finite OpenAI output cap %s, complete history, and tagged estimate', async (cap) => {
    const unknownProvider = new OpenAiProvider('secret', 'custom-unknown-model');
    const unknownCall = await unknownProvider.prepare({ ...request, maxOutputTokens: cap });
    const body = JSON.parse(unknownCall.body);
    expect(body.max_completion_tokens).toBe(cap);
    expect(body.messages).toHaveLength(4);
    expect(unknownCall.body).toContain('history');
    expect(unknownCall.body).not.toContain('secret');
    expect(unknownCall.serializedBytes).toBe(Buffer.byteLength(unknownCall.body, 'utf8'));
    expect(unknownCall.estimate.source).toBe('CONSERVATIVE_FALLBACK');
    expect(unknownCall.estimate.inputTokens).toBe(Buffer.byteLength(unknownCall.body, 'utf8') + 1024 + 64 * 4);

    const knownProvider = new OpenAiProvider('secret', 'gpt-4o-mini');
    const knownCall = await knownProvider.prepare({ ...request, maxOutputTokens: cap });
    expect(knownCall.estimate.source).toBe('MODEL_TOKENIZER');
    expect(knownCall.estimate.inputTokens).toBeLessThan(knownCall.serializedBytes);
  });

  it('sends exactly the prepared body despite subsequent mutation of the source request', async () => {
    const provider = new OpenAiProvider('secret', 'gpt-4o-mini');
    const source = structuredClone(request);
    const call = await provider.prepare(source);
    source.systemPrompt = 'changed';
    let sent = '';
    global.fetch = jest.fn<any>(async (_url: any, options: any) => { sent = options.body; return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })); });
    await provider.generatePrepared(call);
    expect(sent.length).toBeGreaterThan(0);
    expect(JSON.parse(sent).max_completion_tokens).toBe(2048);
    expect(sent).toBe(call.body);
    expect(sent).not.toContain('changed');
  });

  it('classifies a cap rejection without issuing an uncapped retry or leaking the response', async () => {
    const provider = new OpenAiProvider('secret', 'gpt-4o-mini');
    let calls = 0;
    global.fetch = jest.fn<any>(async () => { calls++; return new Response('secret raw response', { status: 400 }); });
    const call = await provider.prepare(request);
    await expect(provider.generatePrepared(call)).rejects.toMatchObject({ code: 'BUDGET_UNSUPPORTED', dispatched: true, definiteRejection: true });
    expect(calls).toBe(1);
  });

  it('does not dispatch an already aborted request', async () => {
    const provider = new OpenAiProvider('secret', 'gpt-4o-mini');
    const abort = new AbortController(); abort.abort();
    let calls = 0;
    global.fetch = jest.fn<any>(async () => { calls++; throw new Error('should not fetch'); });
    const call = await provider.prepare(request);
    await expect(provider.generatePrepared(call, abort.signal)).rejects.toMatchObject({ code: 'PROVIDER_ABORTED', dispatched: false });
    expect(calls).toBe(0);
  });

  it('classifies network ambiguity safely without exposing low-level error text', async () => {
    const provider = new OpenAiProvider('secret', 'gpt-4o-mini');
    global.fetch = jest.fn<any>(async () => { throw new Error('secret in low-level URL'); });
    const call = await provider.prepare(request);
    await expect(provider.generatePrepared(call)).rejects.toMatchObject({ code: 'PROVIDER_NETWORK_ERROR', dispatched: true, definiteRejection: false });
  });

  it('caps Gemini output, disables supported optional thinking explicitly, and skips remote count for ADMIN', async () => {
    let calls = 0;
    global.fetch = jest.fn<any>(async () => { calls++; return new Response(JSON.stringify({ totalTokens: 25 })); });
    const call = await new GeminiProvider('secret', 'gemini-2.5-flash').prepare(request, { profile: 'ADMIN' });
    expect(JSON.parse(call.body).generationConfig).toEqual({ maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } });
    expect(calls).toBe(0);
    expect(call.estimate.source).toBe('MODEL_TOKENIZER');
  });

  it('fails closed for a Gemini model without a verified bounded thinking contract', async () => {
    await expect(new GeminiProvider('secret', 'future-thinking-model').prepare(request, { profile: 'ADMIN' })).rejects.toThrow('BUDGET_UNSUPPORTED');
    await expect(new GeminiProvider('secret', 'gemini-2.5-pro').prepare(request, { profile: 'ADMIN' })).rejects.toThrow('BUDGET_UNSUPPORTED');
  });

  it('preserves the total Gemini usage including thought tokens', async () => {
    const provider = new GeminiProvider('secret', 'gemini-2.5-flash');
    const call = await provider.prepare(request, { profile: 'ADMIN' });
    global.fetch = jest.fn<any>(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, thoughtsTokenCount: 5, totalTokenCount: 35 } })));
    expect((await provider.generatePrepared(call)).usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 35 });
  });
});
