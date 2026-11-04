import { AgentRoleRule, EffectiveAllowance } from './agent-policy.types';
import { AgentProfile } from './agent-profile.types';

export function evaluateRolePolicy(profile: AgentProfile, rules: AgentRoleRule[], memberRoleIds: string[]): EffectiveAllowance {
  const roles = new Set(memberRoleIds);
  let chatAllowed = false;
  let dailyTokenLimit = 0;
  let dailyImageLimit = 0;
  for (const rule of rules) {
    if (!roles.has(rule.roleId)) continue;
    if (profile === 'ADMIN' && rule.chatEnabled && rule.dailyTokenLimit === null) chatAllowed = true;
    if (profile === 'PUBLIC' && rule.chatEnabled && typeof rule.dailyTokenLimit === 'number'
      && Number.isSafeInteger(rule.dailyTokenLimit) && rule.dailyTokenLimit > 0 && rule.dailyTokenLimit <= 100000000) {
      chatAllowed = true;
      dailyTokenLimit = Math.max(dailyTokenLimit, rule.dailyTokenLimit);
    }
    if (rule.imageEnabled && Number.isSafeInteger(rule.dailyImageLimit)
      && rule.dailyImageLimit > 0 && rule.dailyImageLimit <= 1000) {
      dailyImageLimit = Math.max(dailyImageLimit, rule.dailyImageLimit);
    }
  }
  return { chatAllowed, imageAllowed: dailyImageLimit > 0, dailyTokenLimit: profile === 'ADMIN' ? null : dailyTokenLimit, dailyImageLimit };
}
