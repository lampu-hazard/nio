export type AgentBehavior = {
  conversationStyle: 'BALANCED' | 'CASUAL' | 'FORMAL';
  responseLength: 'CONCISE' | 'ADAPTIVE' | 'DETAILED';
  activityVisibility: 'BRIEF' | 'HIDDEN';
  webResearchPolicy: 'AUTO' | 'ON_REQUEST';
};

export const DEFAULT_AGENT_BEHAVIOR: Readonly<AgentBehavior> = Object.freeze({
  conversationStyle: 'BALANCED', responseLength: 'ADAPTIVE',
  activityVisibility: 'BRIEF', webResearchPolicy: 'AUTO',
});

export const AGENT_BEHAVIOR_VALUES = {
  conversationStyle: ['BALANCED', 'CASUAL', 'FORMAL'],
  responseLength: ['CONCISE', 'ADAPTIVE', 'DETAILED'],
  activityVisibility: ['BRIEF', 'HIDDEN'],
  webResearchPolicy: ['AUTO', 'ON_REQUEST'],
} as const;

export function normalizeAgentBehavior(input?: Partial<AgentBehavior> | null): AgentBehavior {
  return Object.fromEntries(Object.entries(DEFAULT_AGENT_BEHAVIOR).map(([key, fallback]) => [
    key, input?.[key as keyof AgentBehavior] ?? fallback,
  ])) as AgentBehavior;
}
