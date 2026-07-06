export type AgentActionType = 'WARN' | 'TIMEOUT';

export type AgentActionStatus = 'PENDING' | 'APPROVED' | 'CANCELLED' | 'EXECUTED' | 'FAILED' | 'EXPIRED';

export type AgentActionRecommendation = {
  type: AgentActionType;
  reason: string;
  durationMinutes?: number;
};

export type CreateAgentActionProposalInput = {
  guildId: string;
  channelId: string;
  requestedById: string;
  targetUserId: string;
  recommendation: AgentActionRecommendation;
};
