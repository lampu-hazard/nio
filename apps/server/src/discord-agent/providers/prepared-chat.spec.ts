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
  it.each([128, 2048, 8192])('serializes finite OpenAI output cap %s and complete history', (cap) => {
    const provider = new OpenAiProvider('secret', 'model');
    const call = provider.prepare({ ...request, maxOutputTokens: cap });
    const body = JSON.parse(call.body);
    expect(body.max_completion_tokens).toBe(cap);
    expect(body.messages).toHaveLength(4);
    expect(call.body).toContain('history');
    expect(call.body).not.toContain('secret');
    expect(call.inputAllowance).toBe(Buffer.byteLength(call.body) + 1024 + 64 * 4);
  });
  it('sends exactly the prepared body despite subsequent mutation of the source request', async () => {
    const provider = new OpenAiProvider('secret', 'model');
    const source = structuredClone(request);
    const call = provider.prepare(source);
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
    const provider = new OpenAiProvider('secret', 'model');
    let calls = 0;
    global.fetch = jest.fn<any>(async () => { calls++; return new Response('secret raw response', { status: 400 }); });
    await expect(provider.generatePrepared(provider.prepare(request))).rejects.toMatchObject({ code: 'BUDGET_UNSUPPORTED', dispatched: true, definiteRejection: true });
    expect(calls).toBe(1);
  });
  it('does not dispatch an already aborted request', async () => {
    const provider = new OpenAiProvider('secret', 'model');
    const abort = new AbortController(); abort.abort();
    let calls = 0;
    global.fetch = jest.fn<any>(async () => { calls++; throw new Error('should not fetch'); });
    await expect(provider.generatePrepared(provider.prepare(request), abort.signal)).rejects.toMatchObject({ code: 'PROVIDER_ABORTED', dispatched: false });
    expect(calls).toBe(0);
  });
  it('classifies network ambiguity safely without exposing low-level error text', async () => {
    const provider = new OpenAiProvider('secret', 'model');
    global.fetch = jest.fn<any>(async () => { throw new Error('secret in low-level URL'); });
    await expect(provider.generatePrepared(provider.prepare(request))).rejects.toMatchObject({ code: 'PROVIDER_NETWORK_ERROR', dispatched: true, definiteRejection: false });
  });
  it('caps Gemini output and disables supported optional thinking explicitly', () => {
    const call = new GeminiProvider('secret', 'gemini-2.5-flash').prepare(request);
    expect(JSON.parse(call.body).generationConfig).toEqual({ maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } });
  });
  it('fails closed for a Gemini model without a verified bounded thinking contract', () => {
    expect(() => new GeminiProvider('secret', 'future-thinking-model').prepare(request)).toThrow('BUDGET_UNSUPPORTED');
    expect(() => new GeminiProvider('secret', 'gemini-2.5-pro').prepare(request)).toThrow('BUDGET_UNSUPPORTED');
  });
  it('preserves the total Gemini usage including thought tokens', async () => {
    const provider = new GeminiProvider('secret', 'gemini-2.5-flash');
    global.fetch = jest.fn<any>(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, thoughtsTokenCount: 5, totalTokenCount: 35 } })));
    expect((await provider.generatePrepared(provider.prepare(request))).usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 35 });
  });
});
