import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Client, Message, TextChannel } from 'discord.js';
import { AppLogger } from '../logger/logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { RustSlowmodeClientService } from './rust-slowmode-client.service';

interface SlowmodeSettings {
  enabled: boolean;
  channels: Set<string>;
  intervalQuiet: number;
  intervalNormal: number;
  intervalBusy: number;
}

@Injectable()
export class DiscordSlowmodeService implements OnModuleInit, OnModuleDestroy {
  private readonly settingsCache = new Map<string, SlowmodeSettings>();
  private readonly lastUpdateTime = new Map<string, number>();
  private client: Pick<Client, 'channels'> | null = null;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
    private readonly rustClient: RustSlowmodeClientService,
  ) {}

  setClient(client: Pick<Client, 'channels'>) {
    this.client = client;
  }

  async onModuleInit() {
    await this.loadAllSettings();

    this.checkInterval = setInterval(() => {
      this.checkQuietChannels().catch((err: Error) => {
        this.logger.error(`Quiet channel check error: ${err.message}`, err.stack, 'DiscordSlowmode');
      });
    }, 15000);
  }

  onModuleDestroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  async loadAllSettings() {
    try {
      const allSettings = await this.prisma.guildSettings.findMany();
      for (const settings of allSettings) {
        this.settingsCache.set(settings.guildId, {
          enabled: settings.slowmodeEnabled,
          channels: new Set(settings.slowmodeChannels),
          intervalQuiet: settings.slowmodeIntervalQuiet,
          intervalNormal: settings.slowmodeIntervalNormal,
          intervalBusy: settings.slowmodeIntervalBusy,
        });
      }
      this.logger.log(`Loaded slowmode settings for ${allSettings.length} guilds.`, 'DiscordSlowmode');
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Failed to load slowmode settings: ${error.message}`, error.stack, 'DiscordSlowmode');
    }
  }

  updateGuildCache(guildId: string, settings: {
    slowmodeEnabled: boolean;
    slowmodeChannels: string[];
    slowmodeIntervalQuiet: number;
    slowmodeIntervalNormal: number;
    slowmodeIntervalBusy: number;
  }) {
    this.settingsCache.set(guildId, {
      enabled: settings.slowmodeEnabled,
      channels: new Set(settings.slowmodeChannels),
      intervalQuiet: settings.slowmodeIntervalQuiet,
      intervalNormal: settings.slowmodeIntervalNormal,
      intervalBusy: settings.slowmodeIntervalBusy,
    });
    this.logger.log(`Updated in-memory slowmode settings for guild: ${guildId}`, 'DiscordSlowmode');
  }

  async handleMessage(message: Message) {
    if (!message.guild || message.author.bot) return;

    const config = this.settingsCache.get(message.guild.id);
    if (!config || !config.enabled || !config.channels.has(message.channel.id)) return;

    const channel = this.asSlowmodeChannel(message.channel as TextChannel);
    if (!channel) return;

    const result = await this.rustClient.analyze(
      message.guild.id,
      channel.id,
      message.author.id,
      Date.now(),
      channel.rateLimitPerUser,
      {
        quietSeconds: config.intervalQuiet,
        normalSeconds: config.intervalNormal,
        busySeconds: config.intervalBusy,
      },
    );

    if (result && result.shouldApply) {
      const previousSeconds = channel.rateLimitPerUser;
      await this.setSlowmode(channel, result.recommendedSeconds, `${result.level} - ${result.reason}`);
      await this.writeAuditLog(message.guild.id, result, channel.id, previousSeconds);
    }
  }

  private async checkQuietChannels() {
    const now = Date.now();

    for (const [guildId, config] of this.settingsCache.entries()) {
      if (!config.enabled) continue;

      for (const channelId of config.channels) {
        const channel = await this.resolveChannel(channelId);
        if (!channel) continue;

        const result = await this.rustClient.analyze(
          guildId,
          channelId,
          'SYSTEM',
          now,
          channel.rateLimitPerUser,
          {
            quietSeconds: config.intervalQuiet,
            normalSeconds: config.intervalNormal,
            busySeconds: config.intervalBusy,
          },
        );

        if (result && result.shouldApply) {
          const previousSeconds = channel.rateLimitPerUser;
          await this.setSlowmode(channel, result.recommendedSeconds, `${result.level} - ${result.reason}`);
          await this.writeAuditLog(guildId, result, channelId, previousSeconds);
        }
      }
    }
  }

  private async setSlowmode(channel: TextChannel, seconds: number, reason: string) {
    if (channel.rateLimitPerUser === seconds) return;

    const channelId = channel.id;
    const now = Date.now();
    const lastUpdate = this.lastUpdateTime.get(channelId) ?? 0;
    if (now - lastUpdate < 15000) return;

    try {
      this.lastUpdateTime.set(channelId, now);
      await channel.setRateLimitPerUser(seconds, reason);
      this.logger.log(`Set slowmode for #${channel.name ?? channel.id} to ${seconds}s. Reason: ${reason}`, 'DiscordSlowmode');
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Failed to set slowmode for #${channel.name ?? channel.id}: ${error.message}`, error.stack, 'DiscordSlowmode');
    }
  }

  private async writeAuditLog(guildId: string, result: any, channelId: string, previousSeconds: number) {
    try {
      const config = this.settingsCache.get(guildId);
      let fromLevel = 'UNKNOWN';
      if (config) {
        if (previousSeconds === config.intervalQuiet) {
          fromLevel = 'QUIET';
        } else if (previousSeconds === config.intervalNormal) {
          fromLevel = 'NORMAL';
        } else if (previousSeconds === config.intervalBusy) {
          fromLevel = 'BUSY';
        }
      }

      // Ensure the SYSTEM user exists first to satisfy the foreign key constraint
      await this.prisma.user.upsert({
        where: { id: 'SYSTEM' },
        update: {},
        create: {
          id: 'SYSTEM',
          username: 'System',
          globalName: 'System',
        },
      });

      await this.prisma.auditLog.create({
        data: {
          guildId,
          userId: 'SYSTEM',
          action: 'SLOWMODE_LEVEL_CHANGED',
          metadata: {
            channelId,
            fromLevel,
            toLevel: result.level,
            previousSeconds,
            recommendedSeconds: result.recommendedSeconds,
            messagesIn10s: result.metrics.messagesIn10s,
            messagesIn60s: result.metrics.messagesIn60s,
            uniqueUsersIn60s: result.metrics.uniqueUsersIn60s,
            reason: result.reason,
          },
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write slowmode audit log: ${err}`, '', 'DiscordSlowmode');
    }
  }

  private async resolveChannel(channelId: string): Promise<TextChannel | null> {
    if (!this.client) return null;

    const channel = this.client.channels.cache.get(channelId) ?? await this.client.channels.fetch(channelId).catch(() => null);
    return this.asSlowmodeChannel(channel as TextChannel | null);
  }

  private asSlowmodeChannel(channel: TextChannel | null): TextChannel | null {
    if (!channel || typeof channel.setRateLimitPerUser !== 'function') return null;
    return channel;
  }
}
