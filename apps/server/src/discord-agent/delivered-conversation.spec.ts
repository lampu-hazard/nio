import { describe, expect, it } from '@jest/globals';
import { deliveredConversationTurns } from './delivered-conversation';
describe('delivered conversation turns', () => {
  it('replaces only the latest assistant text without mutating prior turns', () => {
    const turns = [{ userPrompt: 'first', aiResponse: 'old', timestamp: 1 }, { userPrompt: 'next', aiResponse: 'unsent', timestamp: 2 }];
    expect(deliveredConversationTurns(turns, 'received')).toEqual([turns[0], { ...turns[1], aiResponse: 'received' }]);
    expect(turns[1].aiResponse).toBe('unsent');
  });
  it('does not create memory without a pending turn or delivered text', () => {
    expect(deliveredConversationTurns(undefined, 'received')).toEqual([]);
    expect(deliveredConversationTurns([], 'received')).toEqual([]);
    expect(deliveredConversationTurns([{ userPrompt: 'hi', aiResponse: 'unsent', timestamp: 1 }], '')).toEqual([]);
  });
});
