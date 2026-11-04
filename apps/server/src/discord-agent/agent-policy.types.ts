export type AgentRoleRule = {
  roleId: string;
  chatEnabled: boolean;
  imageEnabled: boolean;
  dailyTokenLimit: number;
  dailyImageLimit: number;
};

export type AgentCapability = 'CHAT' | 'IMAGE';

export type EffectiveAllowance = {
  chatAllowed: boolean;
  imageAllowed: boolean;
  dailyTokenLimit: number;
  dailyImageLimit: number;
};
