import { Injectable, OnModuleInit } from '@nestjs/common';
import { Message } from 'discord.js';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../logger/logger.service';
import { RustAnomalyClientService } from './rust-anomaly-client.service';

interface AnomalySettings {
  enabled: boolean;
  phishingEnabled: boolean;
  contentAnomalyEnabled: boolean;
  userAnomalyEnabled: boolean;
  guildBaselineEnabled: boolean;
  enforcementMode: 'AUDIT_ONLY' | 'DELETE_HIGH_CONFIDENCE' | 'DELETE_AND_TIMEOUT_CRITICAL';
}

@Injectable()
export class DiscordAnomalyService implements OnModuleInit {
  private readonly settingsCache = new Map<string, AnomalySettings>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
    private readonly rustClient: RustAnomalyClientService,
  ) {}

  async onModuleInit() {
    await this.loadAllSettings();
  }

  async loadAllSettings() {
    try {
      const allSettings = await this.prisma.guildSettings.findMany();
      for (const settings of allSettings) {
        this.settingsCache.set(settings.guildId, {
          enabled: settings.anomalyEnabled,
          phishingEnabled: settings.phishingDetectionEnabled,
          contentAnomalyEnabled: settings.contentAnomalyEnabled,
          userAnomalyEnabled: settings.userAnomalyEnabled,
          guildBaselineEnabled: settings.guildBaselineEnabled,
          enforcementMode: (settings.anomalyEnforcementMode as any) || 'AUDIT_ONLY',
        });
      }
      this.logger.log(`Loaded anomaly settings for ${allSettings.length} guilds.`, 'DiscordAnomaly');
    } catch (err: any) {
      this.logger.error(`Failed to load anomaly settings cache: ${err.message}`, err.stack, 'DiscordAnomaly');
    }
  }

  updateGuildCache(guildId: string, settings: AnomalySettings) {
    this.settingsCache.set(guildId, settings);
    this.logger.log(`Updated in-memory anomaly settings for guild: ${guildId}`, 'DiscordAnomaly');
  }

  async handleMessage(message: Message) {
    if (!message.guild || message.author.bot) return;

    let config = this.settingsCache.get(message.guild.id);
    if (!config) {
      // Lazy load
      const settings = await this.prisma.guildSettings.findUnique({
        where: { guildId: message.guild.id },
      });
      config = {
        enabled: settings?.anomalyEnabled || false,
        phishingEnabled: settings?.phishingDetectionEnabled ?? true,
        contentAnomalyEnabled: settings?.contentAnomalyEnabled ?? true,
        userAnomalyEnabled: settings?.userAnomalyEnabled ?? true,
        guildBaselineEnabled: settings?.guildBaselineEnabled ?? true,
        enforcementMode: (settings?.anomalyEnforcementMode as any) || 'AUDIT_ONLY',
      };
      this.settingsCache.set(message.guild.id, config);
    }

    if (!config.enabled) return;

    // Parse URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = message.content.match(urlRegex) || [];

    const enforcementInt =
      config.enforcementMode === 'AUDIT_ONLY'
        ? 1
        : config.enforcementMode === 'DELETE_HIGH_CONFIDENCE'
        ? 2
        : 3;

    const response = await this.rustClient.analyze({
      guildId: message.guild.id,
      channelId: message.channel.id,
      userId: message.author.id,
      messageId: message.id,
      content: message.content,
      urls,
      timestampMs: Date.now(),
      config: {
        phishingEnabled: config.phishingEnabled,
        contentAnomalyEnabled: config.contentAnomalyEnabled,
        userAnomalyEnabled: config.userAnomalyEnabled,
        guildBaselineEnabled: config.guildBaselineEnabled,
        enforcementMode: enforcementInt,
      },
    });

    if (!response) return;

    const decisionStr =
      response.decision === 3 ? 'DELETE_MESSAGE' : response.decision === 4 ? 'TIMEOUT_USER' : 'ALLOW';

    // Handle Moderation Enforcement
    if (decisionStr === 'DELETE_MESSAGE' && config.enforcementMode !== 'AUDIT_ONLY') {
      try {
        await message.delete();
        this.logger.log(`Deleted phishing/anomaly message: ${message.id} from user ${message.author.id}`, 'DiscordAnomaly');
      } catch (err: any) {
        this.logger.error(`Failed to delete message: ${err.message}`, err.stack, 'DiscordAnomaly');
      }
    }

    // Write Audit Log
    if (response.decision !== 1) { // 1 = ALLOW
      await this.writeAuditLog(message.guild.id, response, message.channel.id, message.author.id);
    }
  }

  private async writeAuditLog(guildId: string, result: any, channelId: string, offenderId: string) {
    try {
      await this.prisma.user.upsert({
        where: { id: 'SYSTEM' },
        update: {},
        create: { id: 'SYSTEM', username: 'System', globalName: 'System' },
      });

      await this.prisma.auditLog.create({
        data: {
          guildId,
          userId: 'SYSTEM',
          action: 'ANOMALY_DETECTION',
          metadata: {
            channelId,
            offenderId,
            decision: result.decision === 3 ? 'DELETE_MESSAGE' : 'AUDIT',
            severity: result.severity === 4 ? 'CRITICAL' : 'HIGH',
            confidence: result.confidence,
            reason: result.reason,
            findings: result.findings,
            metrics: result.metrics,
          },
        },
      });
    } catch (err: any) {
      this.logger.error(`Failed to write anomaly audit log: ${err.message}`, err.stack, 'DiscordAnomaly');
    }
  }
}
