import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ChannelType, PermissionsBitField } from 'discord.js';
import { DiscordBotService } from '../discord/discord-bot.service';
import { DiscordSlowmodeService } from '../discord/discord-slowmode.service';
import { DiscordAnomalyService } from '../discord/discord-anomaly.service';
import { PrismaService } from '../prisma/prisma.service';
import { StickersService } from '../stickers/stickers.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const MANAGE_GUILD = 0x20n;
const MANAGE_ROLES = 0x10000000n;
const ADMINISTRATOR = 0x8n;

@Injectable()
export class GuildsService {
  constructor(
    private readonly bot: DiscordBotService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => StickersService))
    private readonly stickers: StickersService,
    private readonly slowmode: DiscordSlowmodeService,
    private readonly anomaly: DiscordAnomalyService,
  ) {}

  canManage(userGuild: any): boolean {
    const perms = BigInt(userGuild.permissions || '0');
    return (perms & ADMINISTRATOR) === ADMINISTRATOR || (perms & MANAGE_GUILD) === MANAGE_GUILD || (perms & MANAGE_ROLES) === MANAGE_ROLES;
  }

  listManageable(sessionGuilds: any[] = []) {
    return sessionGuilds.filter((g) => this.canManage(g)).map((g) => ({
      ...g,
      botInGuild: this.bot.client.guilds.cache.has(g.id),
      inviteUrl: this.inviteUrl(g.id),
      iconUrl: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : null,
    }));
  }

  async getGuild(guildId: string) {
    return this.bot.client.guilds.cache.get(guildId) || this.bot.client.guilds.fetch(guildId);
  }

  async getChannels(guildId: string) {
    const guild = await this.getGuild(guildId);
    await guild.channels.fetch();
    return guild.channels.cache
      .filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
      .map((c) => ({ id: c.id, name: c.name, type: c.type }));
  }

  async getRoles(guildId: string) {
    const guild = await this.getGuild(guildId);
    await guild.roles.fetch();
    const me = guild.members.me || await guild.members.fetchMe();
    return guild.roles.cache.filter((r) => r.id !== guild.id && !r.managed).map((r) => ({
      id: r.id,
      name: r.name,
      color: r.hexColor,
      position: r.position,
      manageable: me.permissions.has(PermissionsBitField.Flags.ManageRoles) && r.position < me.roles.highest.position,
    })).sort((a, b) => b.position - a.position);
  }

  inviteUrl(guildId: string) {
    const params = new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID || '', permissions: '268435456', scope: 'bot applications.commands', guild_id: guildId, disable_guild_select: 'true' });
    return `https://discord.com/oauth2/authorize?${params.toString()}`;
  }

  async getAuditLogs(guildId: string, query: { userId?: string; excludeSystem?: string; action?: string } = {}) {
    const where: any = { guildId };

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.action) {
      where.action = query.action;
    }

    if (query.excludeSystem === 'true') {
      where.action = {
        notIn: ['SLOWMODE_LEVEL_CHANGED'],
      };
    }

    return this.prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            globalName: true,
            avatar: true,
          },
        },
        panel: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getSettings(guildId: string) {
    const settings = await this.prisma.guildSettings.findUnique({
      where: { guildId },
    });
    return {
      logChannelId: settings?.logChannelId || null,
      messageDeleteLogChannelId: settings?.messageDeleteLogChannelId || null,
      stickerEnabled: settings?.stickerEnabled || false,
      slowmodeEnabled: settings?.slowmodeEnabled || false,
      slowmodeChannels: settings?.slowmodeChannels || [],
      slowmodeIntervalQuiet: settings?.slowmodeIntervalQuiet ?? 0,
      slowmodeIntervalNormal: settings?.slowmodeIntervalNormal ?? 5,
      slowmodeIntervalBusy: settings?.slowmodeIntervalBusy ?? 10,
      anomalyEnabled: settings?.anomalyEnabled || false,
      phishingDetectionEnabled: settings?.phishingDetectionEnabled ?? true,
      contentAnomalyEnabled: settings?.contentAnomalyEnabled ?? true,
      userAnomalyEnabled: settings?.userAnomalyEnabled ?? true,
      guildBaselineEnabled: settings?.guildBaselineEnabled ?? true,
      anomalyEnforcementMode: settings?.anomalyEnforcementMode || 'AUDIT_ONLY',
    };
  }

  async updateSettings(guildId: string, dto: UpdateSettingsDto) {
    const updated = await this.prisma.guildSettings.upsert({
      where: { guildId },
      update: {
        logChannelId: dto.logChannelId !== undefined ? dto.logChannelId : undefined,
        messageDeleteLogChannelId: dto.messageDeleteLogChannelId !== undefined ? dto.messageDeleteLogChannelId : undefined,
        stickerEnabled: dto.stickerEnabled !== undefined ? dto.stickerEnabled : undefined,
        slowmodeEnabled: dto.slowmodeEnabled !== undefined ? dto.slowmodeEnabled : undefined,
        slowmodeChannels: dto.slowmodeChannels !== undefined ? dto.slowmodeChannels : undefined,
        slowmodeIntervalQuiet: dto.slowmodeIntervalQuiet !== undefined ? dto.slowmodeIntervalQuiet : undefined,
        slowmodeIntervalNormal: dto.slowmodeIntervalNormal !== undefined ? dto.slowmodeIntervalNormal : undefined,
        slowmodeIntervalBusy: dto.slowmodeIntervalBusy !== undefined ? dto.slowmodeIntervalBusy : undefined,
        anomalyEnabled: dto.anomalyEnabled !== undefined ? dto.anomalyEnabled : undefined,
        phishingDetectionEnabled: dto.phishingDetectionEnabled !== undefined ? dto.phishingDetectionEnabled : undefined,
        contentAnomalyEnabled: dto.contentAnomalyEnabled !== undefined ? dto.contentAnomalyEnabled : undefined,
        userAnomalyEnabled: dto.userAnomalyEnabled !== undefined ? dto.userAnomalyEnabled : undefined,
        guildBaselineEnabled: dto.guildBaselineEnabled !== undefined ? dto.guildBaselineEnabled : undefined,
        anomalyEnforcementMode: dto.anomalyEnforcementMode !== undefined ? dto.anomalyEnforcementMode : undefined,
      },
      create: {
        guildId,
        logChannelId: dto.logChannelId || null,
        messageDeleteLogChannelId: dto.messageDeleteLogChannelId || null,
        stickerEnabled: dto.stickerEnabled || false,
        slowmodeEnabled: dto.slowmodeEnabled || false,
        slowmodeChannels: dto.slowmodeChannels || [],
        slowmodeIntervalQuiet: dto.slowmodeIntervalQuiet ?? 0,
        slowmodeIntervalNormal: dto.slowmodeIntervalNormal ?? 5,
        slowmodeIntervalBusy: dto.slowmodeIntervalBusy ?? 10,
        anomalyEnabled: dto.anomalyEnabled || false,
        phishingDetectionEnabled: dto.phishingDetectionEnabled ?? true,
        contentAnomalyEnabled: dto.contentAnomalyEnabled ?? true,
        userAnomalyEnabled: dto.userAnomalyEnabled ?? true,
        guildBaselineEnabled: dto.guildBaselineEnabled ?? true,
        anomalyEnforcementMode: dto.anomalyEnforcementMode || 'AUDIT_ONLY',
      },
    });

    if (dto.stickerEnabled !== undefined) {
      await this.stickers.setEnabled(guildId, dto.stickerEnabled);
    }

    this.slowmode.updateGuildCache(guildId, {
      slowmodeEnabled: updated.slowmodeEnabled,
      slowmodeChannels: updated.slowmodeChannels,
      slowmodeIntervalQuiet: updated.slowmodeIntervalQuiet,
      slowmodeIntervalNormal: updated.slowmodeIntervalNormal,
      slowmodeIntervalBusy: updated.slowmodeIntervalBusy,
    });

    this.anomaly.updateGuildCache(guildId, {
      enabled: updated.anomalyEnabled,
      phishingEnabled: updated.phishingDetectionEnabled,
      contentAnomalyEnabled: updated.contentAnomalyEnabled,
      userAnomalyEnabled: updated.userAnomalyEnabled,
      guildBaselineEnabled: updated.guildBaselineEnabled,
      enforcementMode: updated.anomalyEnforcementMode as any || 'AUDIT_ONLY',
    });

    return updated;
  }
}
