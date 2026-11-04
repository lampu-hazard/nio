import { Injectable } from '@nestjs/common';
import { Client, PermissionFlagsBits } from 'discord.js';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AgentCapability, AgentRoleRule, AgentUserTokenRule, EffectiveAllowance } from './agent-policy.types';
import { AgentProfile, AgentRequestScope, AgentScope, parseAgentProfile } from './agent-profile.types';
import { evaluateRolePolicy } from './agent-policy';

type Settings = Prisma.DiscordAgentSettingsGetPayload<{ include: { roleRules: true } }>;
export type AdmissionDecision =
  | { allowed: false; code: string }
  | { allowed: true; settings: Settings; allowance: EffectiveAllowance };

@Injectable()
export class AgentAccessService {
  private client?: Client;
  constructor(private readonly prisma: PrismaService) {}
  setClient(client: Client) { this.client = client; }

  private allowance(profile: AgentProfile, rules: AgentRoleRule[], roleIds: string[], userId: string, userTokenRules: unknown): EffectiveAllowance {
    const allowance = evaluateRolePolicy(profile, rules, roleIds);
    if (profile !== 'PUBLIC' || !allowance.chatAllowed) return allowance;
    const personal = Array.isArray(userTokenRules)
      ? userTokenRules.find((rule: AgentUserTokenRule) => rule?.userId === userId) : undefined;
    if (personal && (personal.dailyTokenLimit === null || (Number.isSafeInteger(personal.dailyTokenLimit)
      && personal.dailyTokenLimit > 0 && personal.dailyTokenLimit <= 100000000))) {
      return { ...allowance, dailyTokenLimit: personal.dailyTokenLimit };
    }
    return allowance;
  }

  async getAllowances(scope: AgentScope, rules: AgentRoleRule[], userIds: string[], userTokenRules: unknown): Promise<Map<string, EffectiveAllowance | null>> {
    const profile = parseAgentProfile(scope.profile);
    const result = new Map<string, EffectiveAllowance | null>(userIds.map((id) => [id, null]));
    const guild = this.client?.guilds.cache.get(scope.guildId);
    if (!guild || userIds.length === 0) return result;
    try {
      const roles = await guild.roles.fetch();
      for (const userId of userIds) {
        try {
          const member = await guild.members.fetch({ user: userId, force: true });
          if (member.guild.id !== scope.guildId) continue;
          result.set(userId, this.allowance(profile, rules, [...member.roles.cache.keys(), scope.guildId].filter((id) => roles.has(id)), userId, userTokenRules));
        } catch { /* Keep this member's allowance unavailable. */ }
      }
    } catch { /* Role lookup unavailable for the entire page. */ }
    return result;
  }

  async resolve(scope: AgentRequestScope, capability: AgentCapability): Promise<AdmissionDecision> {
    const { guildId, channelId, userId } = scope;
    const profile = parseAgentProfile(scope.profile);
    const settings = await this.prisma.discordAgentSettings.findUnique({ where: { guildId_profile: { guildId, profile } }, include: { roleRules: true } });
    if (!settings?.enabled) return { allowed: false, code: 'DISABLED' };
    if (settings.profile !== profile || settings.accessMode !== 'ROLE_QUOTAS'
      || settings.tokenQuotaMode !== (profile === 'ADMIN' ? 'UNLIMITED' : 'LIMITED')) return { allowed: false, code: 'POLICY_INVALID' };
    const excluded = (id: string) => settings.excludedChannelIds.includes('*') || settings.excludedChannelIds.includes(id);
    if (excluded(channelId)) return { allowed: false, code: 'CHANNEL_EXCLUDED' };
    if (capability === 'IMAGE' && !settings.imageEnabled) return { allowed: false, code: 'IMAGES_DISABLED' };
    const guild = this.client?.guilds.cache.get(guildId);
    if (!guild) return { allowed: false, code: 'MEMBERSHIP_UNAVAILABLE' };
    let channel;
    try { channel = await guild.channels.fetch(channelId, { force: true }); }
    catch { return { allowed: false, code: 'CHANNEL_UNAVAILABLE' }; }
    if (!channel || channel.guildId !== guildId || !channel.isTextBased()) return { allowed: false, code: 'CHANNEL_UNAVAILABLE' };
    const parentId = channel.isThread() ? channel.parentId : null;
    if (parentId && excluded(parentId)) return { allowed: false, code: 'CHANNEL_EXCLUDED' };
    if (!settings.allowedChannelIds.includes('*')
      && !settings.allowedChannelIds.includes(channelId)
      && !(parentId && settings.allowedChannelIds.includes(parentId))) {
      return { allowed: false, code: 'CHANNEL_DENIED' };
    }
    try {
      const member = await guild.members.fetch({ user: userId, force: true });
      if (member.guild.id !== guildId) return { allowed: false, code: 'MEMBERSHIP_UNAVAILABLE' };
      const bot = await guild.members.fetchMe({ force: true });
      const sendPermission = channel.isThread() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages;
      for (const actor of [member, bot]) {
        const permissions = channel.permissionsFor(actor);
        if (!permissions?.has(PermissionFlagsBits.ViewChannel) || !permissions.has(sendPermission)) return { allowed: false, code: 'CHANNEL_PERMISSIONS' };
      }
      if (channel.isThread() && (channel.archived || channel.locked)) return { allowed: false, code: 'CHANNEL_UNAVAILABLE' };
      const currentRoles = await guild.roles.fetch();
      const roleIds = [...member.roles.cache.keys(), guildId].filter((id) => currentRoles.has(id));
      const allowance = this.allowance(profile, settings.roleRules, roleIds, userId, settings.userTokenRules);
      if (!(capability === 'CHAT' ? allowance.chatAllowed : allowance.imageAllowed)) return { allowed: false, code: 'ROLE_DENIED' };
      return { allowed: true, settings, allowance };
    } catch { return { allowed: false, code: 'MEMBERSHIP_UNAVAILABLE' }; }
  }
}
