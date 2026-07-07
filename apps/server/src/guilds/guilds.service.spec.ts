import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { GuildsService } from './guilds.service';
import { DiscordBotService } from '../discord/discord-bot.service';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordSlowmodeService } from '../discord/discord-slowmode.service';
import { DiscordAnomalyService } from '../discord/discord-anomaly.service';
import { StickersService } from '../stickers/stickers.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

describe('GuildsService', () => {
  let service: GuildsService;
  let bot: any;
  let prisma: any;
  let stickers: any;
  let slowmode: any;
  let anomaly: any;

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

    service = new GuildsService(
      bot as unknown as DiscordBotService,
      prisma as unknown as PrismaService,
      stickers as unknown as StickersService,
      slowmode as unknown as DiscordSlowmodeService,
      anomaly as unknown as DiscordAnomalyService,
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
  });
});