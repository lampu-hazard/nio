import { describe, expect, it } from '@jest/globals';
import { evaluateRolePolicy } from './agent-policy';

const rules = [
  { roleId: '10000', chatEnabled: true, imageEnabled: false, dailyTokenLimit: 20000, dailyImageLimit: 0 },
  { roleId: '20000', chatEnabled: true, imageEnabled: true, dailyTokenLimit: 100000, dailyImageLimit: 5 },
  { roleId: '30000', chatEnabled: false, imageEnabled: true, dailyTokenLimit: 999999, dailyImageLimit: 2 },
];

describe('evaluateRolePolicy', () => {
  it('admits an enabled ADMIN role with no token ceiling but finite images', () => {
    expect(evaluateRolePolicy('ADMIN', [{ ...rules[1], dailyTokenLimit: null }], ['20000'])).toEqual({
      chatAllowed: true, imageAllowed: true, dailyTokenLimit: null, dailyImageLimit: 5,
    });
    expect(evaluateRolePolicy('ADMIN', [], ['20000']).chatAllowed).toBe(false);
    expect(evaluateRolePolicy('PUBLIC', [{ ...rules[1], dailyTokenLimit: null }], ['20000']).chatAllowed).toBe(false);
  });
  it('takes independent maxima rather than adding role allowances', () => {
    expect(evaluateRolePolicy('PUBLIC', rules, ['10000', '20000', '30000'])).toEqual({
      chatAllowed: true, imageAllowed: true, dailyTokenLimit: 100000, dailyImageLimit: 5,
    });
  });

  it('does not grant chat through an image-only role', () => {
    expect(evaluateRolePolicy('PUBLIC', rules, ['30000'])).toEqual({
      chatAllowed: false, imageAllowed: true, dailyTokenLimit: 0, dailyImageLimit: 2,
    });
  });

  it.each([{ roles: [] }, { roles: ['unknown'] }, { roles: ['*'] }])('denies unmatched roles $roles', ({ roles }) => {
    expect(evaluateRolePolicy('PUBLIC', rules, roles)).toEqual({
      chatAllowed: false, imageAllowed: false, dailyTokenLimit: 0, dailyImageLimit: 0,
    });
  });

  it('grants everyone only when explicitly configured and matched', () => {
    expect(evaluateRolePolicy('PUBLIC', [rules[0]], ['10000']).dailyTokenLimit).toBe(20000);
    expect(evaluateRolePolicy('PUBLIC', [], ['10000']).chatAllowed).toBe(false);
  });

  it('does not treat zero as unlimited or accept malformed persisted grants', () => {
    const invalid = [0, -1, NaN, Infinity, 1.5, 100000001];
    for (const dailyTokenLimit of invalid) {
      expect(evaluateRolePolicy('PUBLIC', [{ ...rules[0], dailyTokenLimit }], ['10000']).chatAllowed).toBe(false);
    }
  });
});
