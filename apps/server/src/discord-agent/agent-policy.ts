import { AgentRoleRule, EffectiveAllowance } from './agent-policy.types';

export function evaluateRolePolicy(rules: AgentRoleRule[], memberRoleIds: string[]): EffectiveAllowance {
  const roles = new Set(memberRoleIds);
  let dailyTokenLimit = 0;
  let dailyImageLimit = 0;
  for (const rule of rules) {
    if (!roles.has(rule.roleId)) continue;
    if (rule.chatEnabled && Number.isSafeInteger(rule.dailyTokenLimit)
      && rule.dailyTokenLimit > 0 && rule.dailyTokenLimit <= 100000000) {
      dailyTokenLimit = Math.max(dailyTokenLimit, rule.dailyTokenLimit);
    }
    if (rule.imageEnabled && Number.isSafeInteger(rule.dailyImageLimit)
      && rule.dailyImageLimit > 0 && rule.dailyImageLimit <= 1000) {
      dailyImageLimit = Math.max(dailyImageLimit, rule.dailyImageLimit);
    }
  }
  return { chatAllowed: dailyTokenLimit > 0, imageAllowed: dailyImageLimit > 0, dailyTokenLimit, dailyImageLimit };
}
