import { AgentCapability } from '../agent-policy.types';
import { AgentProfile } from '../agent-profile.types';
import { TokenEstimate } from '../interfaces/ai-provider.interface';

export type Lease = { guildId: string; userId: string; requestId: string; fence: bigint; expiresAt: Date };

export type TokenQuotaPolicy =
  | { mode: 'LIMITED'; guildLimit: number; memberLimit: number | null; runTokenLimit: number }
  | { mode: 'UNLIMITED'; guildLimit: null; memberLimit: null; runTokenLimit: null };

export type ReserveInput = {
  attemptId: string;
  requestKey?: string;
  lease: Lease;
  profile: AgentProfile;
  runId?: string;
  capability: AgentCapability;
  policyRevision: bigint;
  tokenPolicy?: TokenQuotaPolicy;
  memberLimit: number | null;
  guildLimit: number | null;
  tokens: number;
  images: number;
  runTokensUsed: number;
  runTokenLimit: number | null;
  estimate?: TokenEstimate;
};

export type AttemptOutcome = {
  kind: 'REPORTED' | 'ESTIMATED' | 'UNCERTAIN' | 'REJECTED' | 'LOCAL_FAILURE';
  tokens?: number;
  images?: number;
  code: string;
  definiteRejection?: boolean;
};

export type AgentQuotaErrorDetails = {
  profile?: AgentProfile;
  limitingScope?: 'GUILD' | 'MEMBER' | 'RUN' | 'INPUT_CAPACITY';
  remaining?: number | null;
  required?: number;
  countSource?: string;
  resetAt?: Date;
};

export class AgentQuotaError extends Error {
  readonly details?: AgentQuotaErrorDetails;
  constructor(readonly code: string, readonly resetAt?: Date, details?: AgentQuotaErrorDetails) {
    super(code);
    this.details = details ? { ...details, ...(resetAt && !details.resetAt ? { resetAt } : {}) } : resetAt ? { resetAt } : undefined;
  }
}
