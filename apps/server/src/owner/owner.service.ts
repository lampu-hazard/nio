import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DiscordBotService } from '../discord/discord-bot.service';
import { AiAgentSettingsService } from '../discord-agent/ai-agent-settings.service';
import { UpdateAiAgentSettingsDto } from '../discord-agent/dto/update-ai-agent-settings.dto';
import { GuildsService } from '../guilds/guilds.service';
import { UpdateSettingsDto } from '../guilds/dto/update-settings.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OwnerService {
  constructor(
    private readonly bot: DiscordBotService,
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly aiSettings: AiAgentSettingsService,
  ) {}

  async overview(days = 30) {
    const boundedDays = this.boundedDays(days);
    const since = new Date(Date.now() - boundedDays * 24 * 60 * 60 * 1000);
    const usage = await this.prisma.agentInteractionLog.aggregate({
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { promptTokens: true, completionTokens: true, totalTokens: true },
    });
    const failures = await this.prisma.agentInteractionLog.count({ where: { createdAt: { gte: since }, status: 'FAILED' } });
    const client = this.bot.client;
    return {
      bot: { online: client.isReady(), id: client.user?.id ?? null, username: client.user?.username ?? null, guildCount: client.guilds.cache.size },
      usage: {
        days: boundedDays,
        requests: usage._count._all,
        failures,
        promptTokens: usage._sum.promptTokens ?? 0,
        completionTokens: usage._sum.completionTokens ?? 0,
        totalTokens: usage._sum.totalTokens ?? 0,
      },
    };
  }

  listGuilds(query = '') {
    const filter = query.trim().toLocaleLowerCase();
    const live = this.bot.client.guilds.cache.map((guild) => ({
      id: guild.id,
      name: guild.name,
      iconUrl: guild.iconURL({ size: 64 }),
      memberCount: guild.memberCount,
      createdAt: guild.createdAt.toISOString(),
      botPresent: true,
    }));
    return live.filter((guild) => !filter || guild.name.toLocaleLowerCase().includes(filter) || guild.id.includes(filter));
  }

  async getGuild(guildId: string, days = 30) {
    const guild = this.bot.client.guilds.cache.get(guildId);
    if (!guild) throw new NotFoundException('Bot is not currently in this guild.');
    const boundedDays = this.boundedDays(days);
    const since = new Date(Date.now() - boundedDays * 24 * 60 * 60 * 1000);
    const [settings, aiSettings, usage] = await Promise.all([
      this.guilds.getSettings(guildId),
      this.aiSettings.getSettings(guildId),
      this.prisma.agentInteractionLog.aggregate({
        where: { guildId, createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { promptTokens: true, completionTokens: true, totalTokens: true },
      }),
    ]);
    const failures = await this.prisma.agentInteractionLog.count({ where: { guildId, createdAt: { gte: since }, status: 'FAILED' } });
    const { hasCredential, ...safeAiSettings } = aiSettings;
    return {
      guild: { id: guild.id, name: guild.name, iconUrl: guild.iconURL({ size: 128 }), memberCount: guild.memberCount, createdAt: guild.createdAt.toISOString() },
      settings,
      aiSettings: { ...safeAiSettings, hasCredential },
      usage: { days: boundedDays, requests: usage._count._all, failures, promptTokens: usage._sum.promptTokens ?? 0, completionTokens: usage._sum.completionTokens ?? 0, totalTokens: usage._sum.totalTokens ?? 0 },
    };
  }

  updateGuildSettings(guildId: string, dto: UpdateSettingsDto) {
    this.requirePresentGuild(guildId);
    return this.guilds.updateSettings(guildId, dto);
  }

  updateAiSettings(guildId: string, dto: UpdateAiAgentSettingsDto) {
    this.requirePresentGuild(guildId);
    if (dto.apiKey !== undefined || dto.clearApiKey !== undefined) {
      throw new BadRequestException('Credential changes are not available in the owner console.');
    }
    return this.aiSettings.updateSettings(guildId, dto);
  }

  async leaveGuild(guildId: string) {
    const guild = this.requirePresentGuild(guildId);
    await guild.leave();
    return { left: true, guildId };
  }

  private requirePresentGuild(guildId: string) {
    const guild = this.bot.client.guilds.cache.get(guildId);
    if (!guild) throw new NotFoundException('Bot is not currently in this guild.');
    return guild;
  }

  private boundedDays(days: number) {
    if (!Number.isFinite(days)) return 30;
    return Math.max(1, Math.min(90, Math.floor(days)));
  }
}
