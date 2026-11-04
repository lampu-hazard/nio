export type AgentRoleRule = {
  roleId: string;
  chatEnabled: boolean;
  imageEnabled: boolean;
  dailyTokenLimit: number | null;
  dailyImageLimit: number;
};

export type AgentUserTokenRule = { userId: string; dailyTokenLimit: number | null };

export type AgentCapability = 'CHAT' | 'IMAGE';

export type EffectiveAllowance = {
  chatAllowed: boolean;
  imageAllowed: boolean;
  dailyTokenLimit: number | null;
  dailyImageLimit: number;
};
