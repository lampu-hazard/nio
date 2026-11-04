import { AttemptOutcome } from './agent-quota.types';

type ReservedAttempt = { reservedTokens: bigint; reservedImages: bigint; dispatchedAt: Date | null };
export function quotaPeriod(now: Date) {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { periodStart, resetAt: new Date(periodStart.getTime() + 86400000) };
}
export function remainingQuota(limit: number, committed: bigint, reserved: bigint) {
  const remaining = BigInt(limit) - committed - reserved;
  return remaining > 0n ? Number(remaining) : 0;
}
export function chargeAttempt(attempt: ReservedAttempt, outcome: AttemptOutcome) {
  const refundable = (outcome.kind === 'LOCAL_FAILURE' && !attempt.dispatchedAt)
    || (outcome.kind === 'REJECTED' && outcome.definiteRejection === true);
  if (refundable) return { tokens: 0n, images: 0n, source: outcome.kind, overrun: false };
  const valid = (value: number | undefined): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  let source = outcome.kind;
  let tokens = attempt.reservedTokens;
  let images = attempt.reservedImages;
  if (outcome.kind === 'REPORTED') {
    const reported = attempt.reservedImages > 0n ? outcome.images : outcome.tokens;
    if (valid(reported)) {
      if (attempt.reservedImages > 0n) images = BigInt(reported);
      else tokens = BigInt(reported);
    } else source = 'ESTIMATED';
  } else if (outcome.kind !== 'ESTIMATED') source = 'UNCERTAIN';
  return { tokens, images, source, overrun: tokens > attempt.reservedTokens || images > attempt.reservedImages };
}
