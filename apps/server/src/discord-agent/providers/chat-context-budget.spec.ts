import { describe, expect, it } from '@jest/globals';
import { AiGenerateRequest, AiMessage } from '../interfaces/ai-provider.interface';
import { fitChatRequest, InsufficientRequestCapacityError } from './chat-context-budget';

const currentRequest: AiMessage = {
  role: 'user',
  parts: [{ type: 'text', text: 'Current question that must never be dropped' }],
};

describe('fitChatRequest context and quota fitting', () => {
  const baseRequest: AiGenerateRequest = {
    systemPrompt: 'Immutable safety system prompt',
    tools: [],
    maxOutputTokens: 2048,
    messages: [
      { role: 'user', parts: [{ type: 'text', text: 'Old turn 1 user '.repeat(40) }] },
      { role: 'assistant', parts: [{ type: 'text', text: 'Old turn 1 assistant '.repeat(40) }] },
      {
        role: 'assistant',
        parts: [{ type: 'tool_call', id: 'tc-1', name: 'web_search', arguments: { query: 'test' } }],
      },
      {
        role: 'user',
        parts: [{ type: 'tool_result', toolCallId: 'tc-1', name: 'web_search', result: { ok: true, value: 'result' } }],
      },
      currentRequest,
    ],
  };

  const mockPrepare = async (req: AiGenerateRequest) => {
    const body = JSON.stringify(req);
    const serializedBytes = Buffer.byteLength(body, 'utf8');
    const inputTokens = req.messages.reduce((sum, msg) => sum + JSON.stringify(msg).length, 100);
    return Object.freeze({
      body,
      serializedBytes,
      maxOutputTokens: req.maxOutputTokens ?? 2048,
      estimate: {
        inputTokens,
        source: 'MODEL_TOKENIZER' as const,
        counterVersion: 'js-tiktoken:1.0.21/o200k_base:v1',
        confidence: 'ESTIMATED' as const,
      },
    });
  };

  it('drops oldest eligible history turns and scales output cap down to fit PUBLIC capacity while keeping system prompt and current user request intact', async () => {
    const fitted = await fitChatRequest(baseRequest, mockPrepare, {
      inputAndOutput: 450,
      outputCap: 2048,
    });

    expect(fitted.removedHistoryTurns).toBeGreaterThan(0);
    expect(fitted.request.systemPrompt).toBe('Immutable safety system prompt');
    expect(fitted.request.messages.at(-1)).toEqual(currentRequest);
    expect(fitted.call.estimate.inputTokens + fitted.call.maxOutputTokens).toBeLessThanOrEqual(450);
    expect(fitted.call.maxOutputTokens).toBeGreaterThanOrEqual(128);
  });

  it('never leaves an orphaned tool_result without its preceding assistant tool_call when compacting', async () => {
    const fitted = await fitChatRequest(baseRequest, mockPrepare, {
      inputAndOutput: 700,
      outputCap: 256,
    });
    const hasToolCall = fitted.request.messages.some((m) => m.parts.some((p) => p.type === 'tool_call'));
    const hasToolResult = fitted.request.messages.some((m) => m.parts.some((p) => p.type === 'tool_result'));
    expect(hasToolCall).toBe(hasToolResult);
  });

  it('passes through without quota compaction when capacity.inputAndOutput is null (ADMIN unlimited)', async () => {
    const fitted = await fitChatRequest(baseRequest, mockPrepare, {
      inputAndOutput: null,
      outputCap: 2048,
    });
    expect(fitted.removedHistoryTurns).toBe(0);
    expect(fitted.request.messages).toHaveLength(baseRequest.messages.length);
    expect(fitted.call.maxOutputTokens).toBe(2048);
  });

  it('throws InsufficientRequestCapacityError with required and available details when even current request + minimum 128 output cannot fit', async () => {
    await expect(
      fitChatRequest(baseRequest, mockPrepare, {
        inputAndOutput: 200,
        outputCap: 2048,
      }),
    ).rejects.toBeInstanceOf(InsufficientRequestCapacityError);
  });
});
