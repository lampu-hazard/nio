import { describe, expect, it } from '@jest/globals';
import { evaluateRolePolicy } from './agent-policy';

const rules = [
  { roleId: '10000', chatEnabled: true, imageEnabled: false, dailyTokenLimit: 20000, dailyImageLimit: 0 },
  { roleId: '20000', chatEnabled: true, imageEnabled: true, dailyTokenLimit: 100000, dailyImageLimit: 5 },
  { roleId: '30000', chatEnabled: false, imageEnabled: true, dailyTokenLimit: 999999, dailyImageLimit: 2 },
];

describe('evaluateRolePolicy', () => {
  it('takes independent maxima rather than adding role allowances', () => {
    expect(evaluateRolePolicy(rules, ['10000', '20000', '30000'])).toEqual({
      chatAllowed: true, imageAllowed: true, dailyTokenLimit: 100000, dailyImageLimit: 5,
    });
  });

  it('does not grant chat through an image-only role', () => {
    expect(evaluateRolePolicy(rules, ['30000'])).toEqual({
      chatAllowed: false, imageAllowed: true, dailyTokenLimit: 0, dailyImageLimit: 2,
    });
  });

  it.each([{ roles: [] }, { roles: ['unknown'] }, { roles: ['*'] }])('denies unmatched roles $roles', ({ roles }) => {
    expect(evaluateRolePolicy(rules, roles)).toEqual({
      chatAllowed: false, imageAllowed: false, dailyTokenLimit: 0, dailyImageLimit: 0,
    });
  });

  it('grants everyone only when explicitly configured and matched', () => {
    expect(evaluateRolePolicy([rules[0]], ['10000']).dailyTokenLimit).toBe(20000);
    expect(evaluateRolePolicy([], ['10000']).chatAllowed).toBe(false);
  });

  it('does not treat zero as unlimited or accept malformed persisted grants', () => {
    const invalid = [0, -1, NaN, Infinity, 1.5, 100000001];
    for (const dailyTokenLimit of invalid) {
      expect(evaluateRolePolicy([{ ...rules[0], dailyTokenLimit }], ['10000']).chatAllowed).toBe(false);
    }
  });
});
