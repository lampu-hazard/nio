import { describe, expect, it } from '@jest/globals';
import { chargeAttempt, quotaPeriod, remainingQuota } from './agent-quota-accounting';

const attempt = { reservedTokens: 70n, reservedImages: 0n, dispatchedAt: new Date('2026-11-04T23:59:59.999Z') };

describe('quota accounting', () => {
  it('uses UTC calendar days', () => {
    expect(quotaPeriod(new Date('2026-11-04T23:59:59.999Z'))).toEqual({
      periodStart: new Date('2026-11-04T00:00:00Z'), resetAt: new Date('2026-11-05T00:00:00Z'),
    });
  });
  it('uses actual usage and records an overrun without clipping it', () => {
    expect(chargeAttempt(attempt, { kind: 'REPORTED', tokens: 120, code: 'OK' })).toEqual({ tokens: 120n, images: 0n, source: 'REPORTED', overrun: true });
  });
  it.each([undefined, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('conservatively charges malformed reported usage %s', (tokens) => {
    expect(chargeAttempt(attempt, { kind: 'REPORTED', tokens, code: 'OK' })).toMatchObject({ tokens: 70n, source: 'ESTIMATED' });
  });
  it('never refunds a dispatched request classified as local failure', () => {
    expect(chargeAttempt(attempt, { kind: 'LOCAL_FAILURE', code: 'ABORT' })).toMatchObject({ tokens: 70n, source: 'UNCERTAIN' });
  });
  it('requires a definite rejection classification for a dispatched refund', () => {
    expect(chargeAttempt(attempt, { kind: 'REJECTED', code: 'HTTP_503' }).tokens).toBe(70n);
    expect(chargeAttempt(attempt, { kind: 'REJECTED', code: 'HTTP_429', definiteRejection: true }).tokens).toBe(0n);
  });
  it('releases undispatched local failure', () => {
    expect(chargeAttempt({ ...attempt, dispatchedAt: null }, { kind: 'LOCAL_FAILURE', code: 'VALIDATION' }).tokens).toBe(0n);
  });
  it('accounts images independently from provider chat tokens', () => {
    expect(chargeAttempt({ ...attempt, reservedTokens: 0n, reservedImages: 1n }, { kind: 'REPORTED', tokens: 100, images: 1, code: 'OK' })).toMatchObject({ tokens: 0n, images: 1n });
  });
  it('subtracts reservations and clamps overrun remaining to zero', () => {
    expect(remainingQuota(100, 30n, 20n)).toBe(50);
    expect(remainingQuota(100, 120n, 0n)).toBe(0);
  });
});
