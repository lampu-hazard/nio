import { describe, expect, it } from '@jest/globals';
import { prepareChatBody, validateTokenUsage } from './chat-request-budget';
import { createConservativeFallbackEstimate } from './chat-token-counter';

describe('serialized chat budgets', () => {
  it('covers UTF-8 JSON bytes, escaping and tagged token estimate metadata', () => {
    const payload = { text: '猫😀\n"quoted"' };
    const serializedBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    const estimate = createConservativeFallbackEstimate(serializedBytes, 3, 2);
    const call = prepareChatBody(payload, 2048, estimate);
    expect(call.body).toBe(JSON.stringify(payload));
    expect(call.serializedBytes).toBe(serializedBytes);
    expect(call.estimate).toEqual(estimate);
    expect(call.maxOutputTokens).toBe(2048);
    expect(Object.isFrozen(call)).toBe(true);
  });
  it('rejects bodies above one MiB before dispatch', () => {
    const estimate = createConservativeFallbackEstimate(1048577, 1, 0);
    expect(() => prepareChatBody({ text: 'x'.repeat(1048576) }, 128, estimate)).toThrow('REQUEST_TOO_LARGE');
  });
  it.each([0, 127, 8193, NaN, Infinity, 128.5])('rejects invalid output cap %s', (cap) => {
    const estimate = createConservativeFallbackEstimate(2, 1, 0);
    expect(() => prepareChatBody({}, cap, estimate)).toThrow('OUTPUT_CAP_INVALID');
  });
  it('uses total including separately reported reasoning, without adding nested detail twice', () => {
    expect(validateTokenUsage({ promptTokens: 10, completionTokens: 20, totalTokens: 35 })).toBe(35);
    expect(validateTokenUsage({ promptTokens: 10, completionTokens: 20, totalTokens: 30 })).toBe(30);
  });
  it.each([undefined, {}, { totalTokens: -1 }, { totalTokens: 1.5 }, { totalTokens: Infinity },
    { totalTokens: Number.MAX_SAFE_INTEGER + 1 }, { promptTokens: 20, completionTokens: 15, totalTokens: 30 },
    { promptTokens: NaN, totalTokens: 30 }, { completionTokens: -1, totalTokens: 30 }])('rejects unreliable usage %j', (usage) => {
    expect(validateTokenUsage(usage)).toBeNull();
  });
});
