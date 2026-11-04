import { Injectable } from '@nestjs/common';
import { Client } from 'discord.js';
import { PrismaService } from '../prisma/prisma.service';
import { AgentProfile, parseAgentProfile } from './agent-profile.types';
import { evaluateRolePolicy } from './agent-policy';

@Injectable()
export class AgentProfileRouterService {
  private client?: Client;
  constructor(private readonly prisma: PrismaService) {}
  setClient(client: Client) { this.client = client; }

  async resolve(guildId: string, channelId: string, explicit?: AgentProfile, userId?: string): Promise<AgentProfile | null> {
    if (explicit !== undefined) parseAgentProfile(explicit);
    const guild = this.client?.guilds.cache.get(guildId);
    if (!guild) return null;
    let channel;
    try { channel = await guild.channels.fetch(channelId, { force: true }); }
    catch { return null; }
    if (!channel || channel.guildId !== guildId || !channel.isTextBased()) return null;
    const parentId = channel.isThread() ? channel.parentId : null;
    const profiles = await this.prisma.discordAgentSettings.findMany({
      where: { guildId, enabled: true },
      include: { roleRules: true },
    });
    const matches = profiles.filter((settings) => {
      if (!settings.enabled || !['PUBLIC', 'ADMIN'].includes(settings.profile)) return false;
      const excluded = settings.excludedChannelIds;
      if (excluded.includes('*') || excluded.includes(channelId) || (parentId && excluded.includes(parentId))) return false;
      return (
        settings.allowedChannelIds.includes('*')
        || settings.allowedChannelIds.includes(channelId)
        || Boolean(parentId && settings.allowedChannelIds.includes(parentId))
      );
    });
    if (explicit !== undefined) {
      return matches.some((settings) => settings.profile === explicit) ? explicit : null;
    }
    if (matches.length === 0) return null;
    if (matches.length === 1) return parseAgentProfile(matches[0].profile);

    const adminSettings = matches.find((settings) => settings.profile === 'ADMIN');
    if (adminSettings && userId && guild.members?.fetch) {
      try {
        const member = await guild.members.fetch({ user: userId, force: true });
        if (member?.guild?.id === guildId) {
          const currentRoles = await guild.roles?.fetch?.().catch(() => null);
          const memberRoleKeys = [...(member.roles?.cache?.keys?.() ?? []), guildId];
          const roleIds = currentRoles ? memberRoleKeys.filter((id) => currentRoles.has(id)) : memberRoleKeys;
          const allowance = evaluateRolePolicy('ADMIN', (adminSettings as any).roleRules ?? [], roleIds);
          if (allowance.chatAllowed || allowance.imageAllowed) {
            return 'ADMIN';
          }
        }
      } catch {
        // Fall through to PUBLIC when member ADMIN role lookup fails.
      }
    }
    return matches.some((settings) => settings.profile === 'PUBLIC') ? 'PUBLIC' : parseAgentProfile(matches[0].profile);
  }
}
