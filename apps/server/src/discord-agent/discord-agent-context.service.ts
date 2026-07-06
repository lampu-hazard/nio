import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Client } from 'discord.js';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { DiscordMessageLogService } from './discord-message-log.service';

@Injectable()
export class DiscordAgentContextService {
  private client?: Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly messageLogs: DiscordMessageLogService,
  ) {}

  setClient(client: Client) {
    this.client = client;
  }

  async buildModContext(guildId: string, targetUserId: string): Promise<Record<string, any>> {
    if (!this.client) {
      throw new ServiceUnavailableException('Discord client is not ready yet.');
    }

    const guild = await this.client.guilds.fetch(guildId).catch(() => null);
    const member = guild ? await guild.members.fetch(targetUserId).catch(() => null) : null;

    let memberData = null;
    if (member) {
      memberData = {
        id: member.id,
        username: member.user.username,
        displayName: member.user.globalName || member.user.username,
        avatarUrl: member.user.displayAvatarURL(),
        isBot: member.user.bot,
        joinedAt: member.joinedAt,
        createdAt: member.user.createdAt,
        premiumSince: member.premiumSince,
        nickname: member.nickname,
        communicationDisabledUntil: member.communicationDisabledUntil,
        roles: member.roles.cache.map((r) => ({ id: r.id, name: r.name })),
      };
    }

    const [warnings, activeWarningCount, modSettings, recentMessages] = await Promise.all([
      this.moderation.listWarnings(guildId, { search: targetUserId }),
      this.moderation.countActiveWarnings(guildId, targetUserId),
      this.moderation.getSettings(guildId),
      this.messageLogs.getUserRecentMessages(guildId, targetUserId, 15),
    ]);

    const formattedWarnings = warnings.map((w) => ({
      id: w.id,
      reason: w.reason,
      moderatorId: w.moderatorId,
      createdAt: w.createdAt,
      expiresAt: w.expiresAt,
    }));

    const formattedMessages = recentMessages.map((m) => ({
      id: m.id,
      channelId: m.channelId,
      content: m.content,
      createdAt: m.createdAt,
      editedAt: m.editedAt,
    }));

    return {
      guild: guild ? { id: guild.id, name: guild.name } : null,
      member: memberData || { id: targetUserId, status: 'Not in guild' },
      warnings: {
        activeCount: activeWarningCount,
        totalCount: warnings.length,
        threshold: modSettings.warnLimitThreshold,
        enabled: modSettings.warnLimitEnabled,
        records: formattedWarnings,
      },
      recentMessages: formattedMessages,
    };
  }
}
