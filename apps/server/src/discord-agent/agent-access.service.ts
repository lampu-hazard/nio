import { Injectable } from '@nestjs/common';
import { Client } from 'discord.js';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AgentCapability, AgentRoleRule, EffectiveAllowance } from './agent-policy.types';
import { evaluateRolePolicy } from './agent-policy';

type Settings = Prisma.DiscordAgentSettingsGetPayload<{ include: { roleRules: true } }>;
export type AdmissionDecision =
  | { allowed: false; code: string }
  | { allowed: true; settings: Settings | null; allowance: EffectiveAllowance };

@Injectable()
export class AgentAccessService {
  private client?: Client;
  constructor(private readonly prisma: PrismaService) {}
  setClient(client: Client) { this.client = client; }

  async getAllowances(guildId: string, rules: AgentRoleRule[], userIds: string[]): Promise<Map<string, EffectiveAllowance | null>> {
    const result = new Map<string, EffectiveAllowance | null>(userIds.map((id) => [id, null]));
    const guild = this.client?.guilds.cache.get(guildId);
    if (!guild || userIds.length === 0) return result;
    try {
      const roles = await guild.roles.fetch();
      // Bound Discord requests rather than launching one request per member at once.
      for (const userId of userIds) {
        try {
          const member = await guild.members.fetch({ user: userId, force: true });
          if (member.guild.id !== guildId) continue;
          result.set(userId, evaluateRolePolicy(rules, [...member.roles.cache.keys(), guildId].filter((id) => roles.has(id))));
        } catch { /* Keep this member's allowance unavailable. */ }
      }
    } catch { /* Role lookup unavailable for the entire page. */ }
    return result;
  }

  async resolve(guildId: string, channelId: string, userId: string, capability: AgentCapability): Promise<AdmissionDecision> {
    const settings = await this.prisma.discordAgentSettings.findUnique({ where: { guildId }, include: { roleRules: true } });
    if (!(settings?.enabled ?? process.env.DISCORD_AGENT_ENABLED === 'true')) return { allowed: false, code: 'DISABLED' };
    if (settings?.excludedChannelIds.some((id) => id === '*' || id === channelId)) return { allowed: false, code: 'CHANNEL_EXCLUDED' };
    if (!settings || settings.accessMode === 'LEGACY_USERS') {
      if (capability === 'IMAGE') return { allowed: false, code: 'ROLE_MODE_REQUIRED' };
      const users = settings?.allowedUserIds ?? (process.env.DISCORD_AGENT_ALLOWED_USER_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);
      if (!users.includes('*') && !users.includes(userId)) return { allowed: false, code: 'USER_DENIED' };
      return { allowed: true, settings, allowance: { chatAllowed: true, imageAllowed: false, dailyTokenLimit: 0, dailyImageLimit: 0 } };
    }
    if (settings.accessMode !== 'ROLE_QUOTAS') return { allowed: false, code: 'POLICY_INVALID' };
    if (capability === 'IMAGE' && !settings.imageEnabled) return { allowed: false, code: 'IMAGES_DISABLED' };
    try {
      const guild = this.client?.guilds.cache.get(guildId);
      if (!guild) return { allowed: false, code: 'MEMBERSHIP_UNAVAILABLE' };
      const member = await guild.members.fetch({ user: userId, force: true });
      if (member.guild.id !== guildId) return { allowed: false, code: 'MEMBERSHIP_UNAVAILABLE' };
      const currentRoles = await guild.roles.fetch();
      const roleIds = [...member.roles.cache.keys(), guildId].filter((id) => currentRoles.has(id));
      const allowance = evaluateRolePolicy(settings.roleRules, roleIds);
      if (!(capability === 'CHAT' ? allowance.chatAllowed : allowance.imageAllowed)) return { allowed: false, code: 'ROLE_DENIED' };
      return { allowed: true, settings, allowance };
    } catch {
      return { allowed: false, code: 'MEMBERSHIP_UNAVAILABLE' };
    }
  }
}
