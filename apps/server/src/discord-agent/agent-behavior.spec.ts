import { describe, expect, it } from '@jest/globals';
import { DEFAULT_AGENT_BEHAVIOR, normalizeAgentBehavior } from './agent-behavior';
describe('behavior normalization', () => {
  it('defaults missing fields and does not mutate selected preferences', () => {
    expect(normalizeAgentBehavior()).toEqual(DEFAULT_AGENT_BEHAVIOR);
    expect(normalizeAgentBehavior(null)).toEqual(DEFAULT_AGENT_BEHAVIOR);
    const input = { conversationStyle: 'FORMAL' as const };
    expect(normalizeAgentBehavior(input)).toEqual({ ...DEFAULT_AGENT_BEHAVIOR, conversationStyle: 'FORMAL' });
    expect(input).toEqual({ conversationStyle: 'FORMAL' });
  });
});
