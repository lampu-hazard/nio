import { describe, expect, it } from '@jest/globals';
import { parseAgentProfile } from './agent-profile.types';

describe('agent profile identity', () => {
  it('accepts only explicit uppercase profile IDs', () => {
    expect(parseAgentProfile('PUBLIC')).toBe('PUBLIC');
    expect(parseAgentProfile('ADMIN')).toBe('ADMIN');
    for (const value of [undefined, null, '', 'admin', 'PUBLIC ', '*', 'OWNER']) {
      expect(() => parseAgentProfile(value)).toThrow('Invalid agent profile');
    }
  });
});
