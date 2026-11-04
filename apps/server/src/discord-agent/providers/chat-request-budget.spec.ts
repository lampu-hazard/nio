import { describe, expect, it } from '@jest/globals';
import { prepareChatBody, validateTokenUsage } from './chat-request-budget';

describe('serialized chat budgets', () => {
  it('covers UTF-8 JSON bytes, escaping and framing, not JavaScript string length', () => {
    const payload = { text: '猫😀\n"quoted"' };
    const call = prepareChatBody(payload, 3, 2, 2048);
    expect(call.body).toBe(JSON.stringify(payload));
    expect(call.inputAllowance).toBe(Buffer.byteLength(call.body, 'utf8') + 1024 + 64 * 5);
    expect(call.maxOutputTokens).toBe(2048);
    expect(Object.isFrozen(call)).toBe(true);
  });
  it('rejects bodies above one MiB before dispatch', () => {
    expect(() => prepareChatBody({ text: 'x'.repeat(1048576) }, 1, 0, 128)).toThrow('REQUEST_TOO_LARGE');
  });
  it.each([0, 127, 8193, NaN, Infinity, 128.5])('rejects invalid output cap %s', (cap) => {
    expect(() => prepareChatBody({}, 1, 0, cap)).toThrow('OUTPUT_CAP_INVALID');
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
