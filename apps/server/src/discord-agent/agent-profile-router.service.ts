import { Injectable } from '@nestjs/common';
import { Client } from 'discord.js';
import { PrismaService } from '../prisma/prisma.service';
import { AgentProfile, parseAgentProfile } from './agent-profile.types';

@Injectable()
export class AgentProfileRouterService {
  private client?: Client;
  constructor(private readonly prisma: PrismaService) {}
  setClient(client: Client) { this.client = client; }

  async resolve(guildId: string, channelId: string, explicit?: AgentProfile): Promise<AgentProfile | null> {
    if (explicit !== undefined) parseAgentProfile(explicit);
    const guild = this.client?.guilds.cache.get(guildId);
    if (!guild) return null;
    let channel;
    try { channel = await guild.channels.fetch(channelId, { force: true }); }
    catch { return null; }
    if (!channel || channel.guildId !== guildId || !channel.isTextBased()) return null;
    const parentId = channel.isThread() ? channel.parentId : null;
    const profiles = await this.prisma.discordAgentSettings.findMany({ where: { guildId, enabled: true } });
    const matches = profiles.filter((settings) => {
      if (!settings.enabled || !['PUBLIC', 'ADMIN'].includes(settings.profile)) return false;
      const excluded = settings.excludedChannelIds;
      if (excluded.includes('*') || excluded.includes(channelId) || (parentId && excluded.includes(parentId))) return false;
      return settings.allowedChannelIds.includes(channelId) || Boolean(parentId && settings.allowedChannelIds.includes(parentId));
    });
    if (matches.length !== 1) return null;
    const profile = parseAgentProfile(matches[0].profile);
    return explicit === undefined || explicit === profile ? profile : null;
  }
}
