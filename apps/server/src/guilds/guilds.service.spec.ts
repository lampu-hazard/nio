import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { GuildsService } from './guilds.service';
import { DiscordBotService } from '../discord/discord-bot.service';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordSlowmodeService } from '../discord/discord-slowmode.service';
import { DiscordAnomalyService } from '../discord/discord-anomaly.service';
import { HallOfFameService } from '../discord/hall-of-fame.service';
import { StickersService } from '../stickers/stickers.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

describe('GuildsService', () => {
  let service: GuildsService;
  let bot: any;
  let prisma: any;
  let stickers: any;
  let slowmode: any;
  let anomaly: any;
  let hallOfFame: any;

  beforeEach(() => {
    bot = {
      client: {
        guilds: {
          cache: {
            has: jest.fn(),
            get: jest.fn(),
          },
        },
      },
    };

    prisma = {
      guildSettings: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    stickers = {
      setEnabled: jest.fn(),
    };

    slowmode = {
      updateGuildCache: jest.fn(),
    };

    anomaly = {
      updateGuildCache: jest.fn(),
    };

    hallOfFame = {
      validateChannel: jest.fn(),
    };

    service = new GuildsService(
      bot as unknown as DiscordBotService,
      prisma as unknown as PrismaService,
      stickers as unknown as StickersService,
      slowmode as unknown as DiscordSlowmodeService,
      anomaly as unknown as DiscordAnomalyService,
      hallOfFame as unknown as HallOfFameService,
    );
  });

  describe('getSettings', () => {
    it('returns default settings when guild settings do not exist', async () => {
      prisma.guildSettings.findUnique.mockResolvedValue(null);

      const result = await service.getSettings('guild-1');

      expect(prisma.guildSettings.findUnique).toHaveBeenCalledWith({
        where: { guildId: 'guild-1' },
      });
      expect(result).toEqual({
        logChannelId: null,
        messageDeleteLogChannelId: null,
        stickerEnabled: false,
        hallOfFameEnabled: false,
        hallOfFameChannelId: null,
        hallOfFameThreshold: 3,
        slowmodeEnabled: false,
        slowmodeChannels: [],
        slowmodeIntervalQuiet: 0,
        slowmodeIntervalNormal: 5,
        slowmodeIntervalBusy: 10,
        anomalyEnabled: false,
        phishingDetectionEnabled: true,
        contentAnomalyEnabled: true,
        userAnomalyEnabled: true,
        guildBaselineEnabled: true,
        anomalyEnforcementMode: 'AUDIT_ONLY',
      });
    });

    it('returns stored settings when guild settings exist', async () => {
      const mockSettings = {
        guildId: 'guild-1',
        logChannelId: 'channel-1',
        messageDeleteLogChannelId: 'channel-del-1',
        stickerEnabled: true,
        hallOfFameEnabled: true,
        hallOfFameChannelId: 'channel-hof',
        hallOfFameThreshold: 5,
        slowmodeEnabled: true,
        slowmodeChannels: ['channel-2'],
        slowmodeIntervalQuiet: 15,
        slowmodeIntervalNormal: 20,
        slowmodeIntervalBusy: 30,
        anomalyEnabled: true,
        phishingDetectionEnabled: false,
        contentAnomalyEnabled: false,
        userAnomalyEnabled: false,
        guildBaselineEnabled: false,
        anomalyEnforcementMode: 'DELETE_HIGH_CONFIDENCE',
      };
      prisma.guildSettings.findUnique.mockResolvedValue(mockSettings);

      const result = await service.getSettings('guild-1');

      expect(prisma.guildSettings.findUnique).toHaveBeenCalledWith({
        where: { guildId: 'guild-1' },
      });
      expect(result).toEqual({
        logChannelId: 'channel-1',
        messageDeleteLogChannelId: 'channel-del-1',
        stickerEnabled: true,
        hallOfFameEnabled: true,
        hallOfFameChannelId: 'channel-hof',
        hallOfFameThreshold: 5,
        slowmodeEnabled: true,
        slowmodeChannels: ['channel-2'],
        slowmodeIntervalQuiet: 15,
        slowmodeIntervalNormal: 20,
        slowmodeIntervalBusy: 30,
        anomalyEnabled: true,
        phishingDetectionEnabled: false,
        contentAnomalyEnabled: false,
        userAnomalyEnabled: false,
        guildBaselineEnabled: false,
        anomalyEnforcementMode: 'DELETE_HIGH_CONFIDENCE',
      });
    });

    it('preserves stored zero-second slowmode settings', async () => {
      prisma.guildSettings.findUnique.mockResolvedValue({
        guildId: 'guild-1',
        logChannelId: null,
        stickerEnabled: false,
        slowmodeEnabled: true,
        slowmodeChannels: ['channel-2'],
        slowmodeIntervalQuiet: 0,
        slowmodeIntervalNormal: 0,
        slowmodeIntervalBusy: 0,
      });

      const result = await service.getSettings('guild-1');

      expect(result).toMatchObject({
        slowmodeIntervalQuiet: 0,
        slowmodeIntervalNormal: 0,
        slowmodeIntervalBusy: 0,
      });
    });
  });

  describe('updateSettings', () => {
    it('updates slowmode settings and returns the updated guild settings', async () => {
      const dto: UpdateSettingsDto = {
        slowmodeEnabled: true,
        slowmodeChannels: ['channel-3'],
        slowmodeIntervalQuiet: 20,
        slowmodeIntervalNormal: 30,
        slowmodeIntervalBusy: 40,
      };

      const mockUpdated = {
        guildId: 'guild-1',
        logChannelId: null,
        messageDeleteLogChannelId: null,
        stickerEnabled: false,
        slowmodeEnabled: true,
        slowmodeChannels: ['channel-3'],
        slowmodeIntervalQuiet: 20,
        slowmodeIntervalNormal: 30,
        slowmodeIntervalBusy: 40,
        anomalyEnabled: false,
        phishingDetectionEnabled: true,
        contentAnomalyEnabled: true,
        userAnomalyEnabled: true,
        guildBaselineEnabled: true,
        anomalyEnforcementMode: 'AUDIT_ONLY',
      };

      prisma.guildSettings.upsert.mockResolvedValue(mockUpdated);

      const result = await service.updateSettings('guild-1', dto);

      expect(prisma.guildSettings.upsert).toHaveBeenCalledWith({
        where: { guildId: 'guild-1' },
        update: {
          logChannelId: undefined,
          messageDeleteLogChannelId: undefined,
          stickerEnabled: undefined,
          hallOfFameEnabled: undefined,
          hallOfFameChannelId: undefined,
          hallOfFameThreshold: undefined,
          slowmodeEnabled: true,
          slowmodeChannels: ['channel-3'],
          slowmodeIntervalQuiet: 20,
          slowmodeIntervalNormal: 30,
          slowmodeIntervalBusy: 40,
          anomalyEnabled: undefined,
          phishingDetectionEnabled: undefined,
          contentAnomalyEnabled: undefined,
          userAnomalyEnabled: undefined,
          guildBaselineEnabled: undefined,
          anomalyEnforcementMode: undefined,
        },
        create: {
          guildId: 'guild-1',
          logChannelId: null,
          messageDeleteLogChannelId: null,
          stickerEnabled: false,
          hallOfFameEnabled: false,
          hallOfFameChannelId: null,
          hallOfFameThreshold: 3,
          slowmodeEnabled: true,
          slowmodeChannels: ['channel-3'],
          slowmodeIntervalQuiet: 20,
          slowmodeIntervalNormal: 30,
          slowmodeIntervalBusy: 40,
          anomalyEnabled: false,
          phishingDetectionEnabled: true,
          contentAnomalyEnabled: true,
          userAnomalyEnabled: true,
          guildBaselineEnabled: true,
          anomalyEnforcementMode: 'AUDIT_ONLY',
        },
      });
      expect(result).toEqual(mockUpdated);
      expect(stickers.setEnabled).not.toHaveBeenCalled();
      expect(slowmode.updateGuildCache).toHaveBeenCalledWith('guild-1', {
        slowmodeEnabled: true,
        slowmodeChannels: ['channel-3'],
        slowmodeIntervalQuiet: 20,
        slowmodeIntervalNormal: 30,
        slowmodeIntervalBusy: 40,
      });
      expect(anomaly.updateGuildCache).toHaveBeenCalledWith('guild-1', {
        enabled: false,
        phishingEnabled: true,
        contentAnomalyEnabled: true,
        userAnomalyEnabled: true,
        guildBaselineEnabled: true,
        enforcementMode: 'AUDIT_ONLY',
      });
    });

    it('triggers stickers setEnabled if stickerEnabled is updated', async () => {
      const dto: UpdateSettingsDto = {
        stickerEnabled: true,
      };

      const mockUpdated = {
        guildId: 'guild-1',
        logChannelId: null,
        messageDeleteLogChannelId: null,
        stickerEnabled: true,
        slowmodeEnabled: false,
        slowmodeChannels: [],
        slowmodeIntervalQuiet: 0,
        slowmodeIntervalNormal: 5,
        slowmodeIntervalBusy: 10,
        anomalyEnabled: false,
        phishingDetectionEnabled: true,
        contentAnomalyEnabled: true,
        userAnomalyEnabled: true,
        guildBaselineEnabled: true,
        anomalyEnforcementMode: 'AUDIT_ONLY',
      };

      prisma.guildSettings.upsert.mockResolvedValue(mockUpdated);

      const result = await service.updateSettings('guild-1', dto);

      expect(prisma.guildSettings.upsert).toHaveBeenCalledWith({
        where: { guildId: 'guild-1' },
        update: {
          logChannelId: undefined,
          messageDeleteLogChannelId: undefined,
          stickerEnabled: true,
          hallOfFameEnabled: undefined,
          hallOfFameChannelId: undefined,
          hallOfFameThreshold: undefined,
          slowmodeEnabled: undefined,
          slowmodeChannels: undefined,
          slowmodeIntervalQuiet: undefined,
          slowmodeIntervalNormal: undefined,
          slowmodeIntervalBusy: undefined,
          anomalyEnabled: undefined,
          phishingDetectionEnabled: undefined,
          contentAnomalyEnabled: undefined,
          userAnomalyEnabled: undefined,
          guildBaselineEnabled: undefined,
          anomalyEnforcementMode: undefined,
        },
        create: {
          guildId: 'guild-1',
          logChannelId: null,
          messageDeleteLogChannelId: null,
          stickerEnabled: true,
          hallOfFameEnabled: false,
          hallOfFameChannelId: null,
          hallOfFameThreshold: 3,
          slowmodeEnabled: false,
          slowmodeChannels: [],
          slowmodeIntervalQuiet: 0,
          slowmodeIntervalNormal: 5,
          slowmodeIntervalBusy: 10,
          anomalyEnabled: false,
          phishingDetectionEnabled: true,
          contentAnomalyEnabled: true,
          userAnomalyEnabled: true,
          guildBaselineEnabled: true,
          anomalyEnforcementMode: 'AUDIT_ONLY',
        },
      });
      expect(result).toEqual(mockUpdated);
      expect(stickers.setEnabled).toHaveBeenCalledWith('guild-1', true);
      expect(slowmode.updateGuildCache).toHaveBeenCalledWith('guild-1', {
        slowmodeEnabled: false,
        slowmodeChannels: [],
        slowmodeIntervalQuiet: 0,
        slowmodeIntervalNormal: 5,
        slowmodeIntervalBusy: 10,
      });
      expect(anomaly.updateGuildCache).toHaveBeenCalledWith('guild-1', {
        enabled: false,
        phishingEnabled: true,
        contentAnomalyEnabled: true,
        userAnomalyEnabled: true,
        guildBaselineEnabled: true,
        enforcementMode: 'AUDIT_ONLY',
      });
    });

    it('throws BadRequestException if enabling Hall of Fame without channel ID', async () => {
      prisma.guildSettings.findUnique.mockResolvedValue(null);

      await expect(
        service.updateSettings('guild-1', { hallOfFameEnabled: true }),
      ).rejects.toThrow(BadRequestException);
    });

    it('validates channel and updates Hall of Fame settings when channel ID is provided', async () => {
      prisma.guildSettings.findUnique.mockResolvedValue(null);
      const mockUpdated = {
        guildId: 'guild-1',
        logChannelId: null,
        messageDeleteLogChannelId: null,
        stickerEnabled: false,
        hallOfFameEnabled: true,
        hallOfFameChannelId: 'channel-hof',
        hallOfFameThreshold: 5,
        slowmodeEnabled: false,
        slowmodeChannels: [],
        slowmodeIntervalQuiet: 0,
        slowmodeIntervalNormal: 5,
        slowmodeIntervalBusy: 10,
        anomalyEnabled: false,
        phishingDetectionEnabled: true,
        contentAnomalyEnabled: true,
        userAnomalyEnabled: true,
        guildBaselineEnabled: true,
        anomalyEnforcementMode: 'AUDIT_ONLY',
      };
      prisma.guildSettings.upsert.mockResolvedValue(mockUpdated);

      const result = await service.updateSettings('guild-1', {
        hallOfFameEnabled: true,
        hallOfFameChannelId: 'channel-hof',
        hallOfFameThreshold: 5,
      });

      expect(hallOfFame.validateChannel).toHaveBeenCalledWith('guild-1', 'channel-hof');
      expect(prisma.guildSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            hallOfFameEnabled: true,
            hallOfFameChannelId: 'channel-hof',
            hallOfFameThreshold: 5,
          }),
        }),
      );
      expect(result).toEqual(mockUpdated);
    });
  });

  describe('getAuditLogs', () => {
    beforeEach(() => {
      prisma.auditLog = {
        findMany: jest.fn(async () => []),
      };
    });

    it('queries audit logs with basic guild filter', async () => {
      await service.getAuditLogs('guild-1', {});

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { guildId: 'guild-1' },
        orderBy: { createdAt: 'desc' },
      }));
    });

    it('queries with user and action filters', async () => {
      await service.getAuditLogs('guild-1', { userId: 'user-1', action: 'PANEL_CREATE' });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          guildId: 'guild-1',
          userId: 'user-1',
          action: 'PANEL_CREATE',
        },
      }));
    });

    it('queries excluding system actions when excludeSystem is true', async () => {
      await service.getAuditLogs('guild-1', { excludeSystem: 'true' });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          guildId: 'guild-1',
          action: {
            notIn: ['SLOWMODE_LEVEL_CHANGED'],
          },
        },
      }));
    });
  });
});