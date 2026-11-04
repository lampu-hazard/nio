import { AgentCapability } from '../agent-policy.types';

export type Lease = { guildId: string; userId: string; requestId: string; fence: bigint; expiresAt: Date };
export type ReserveInput = {
  attemptId: string; requestKey?: string; lease: Lease; runId?: string; capability: AgentCapability;
  policyRevision: bigint; memberLimit: number; guildLimit: number; tokens: number; images: number;
  runTokensUsed: number; runTokenLimit: number;
};
export type AttemptOutcome = {
  kind: 'REPORTED' | 'ESTIMATED' | 'UNCERTAIN' | 'REJECTED' | 'LOCAL_FAILURE';
  tokens?: number; images?: number; code: string; definiteRejection?: boolean;
};
export class AgentQuotaError extends Error {
  constructor(readonly code: string, readonly resetAt?: Date) { super(code); }
}
