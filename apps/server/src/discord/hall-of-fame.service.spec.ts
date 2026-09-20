import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { ChannelType, PermissionsBitField } from 'discord.js';
import { HallOfFameService } from './hall-of-fame.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../logger/logger.service';

class MockCollection<K, V> extends Map<K, V> {
  filter(fn: (value: V, key: K) => boolean): MockCollection<K, V> {
    const result = new MockCollection<K, V>();
    for (const [key, value] of this.entries()) {
      if (fn(value, key)) result.set(key, value);
    }
    return result;
  }
}

describe('HallOfFameService', () => {
  let service: HallOfFameService;

  const mockPrisma = {
    guildSettings: {
      findUnique: jest.fn<any>(),
    },
    hallOfFameEntry: {
      findUnique: jest.fn<any>(),
      findMany: jest.fn<any>(),
      create: jest.fn<any>(),
      update: jest.fn<any>(),
      delete: jest.fn<any>(),
      deleteMany: jest.fn<any>(),
    },
  };

  const mockLogger = {
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  };

  const mockClient = {
    guilds: {
      fetch: jest.fn<any>(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.hallOfFameEntry.delete.mockResolvedValue({});
    mockPrisma.hallOfFameEntry.deleteMany.mockResolvedValue({});
    service = new HallOfFameService(mockPrisma as any, mockLogger as any);
    service.setClient(mockClient as any);
  });

  describe('validateChannel', () => {
    it('throws when channel is not text-based', async () => {
      mockClient.guilds.fetch.mockResolvedValue({
        channels: {
          fetch: jest.fn<any>().mockResolvedValue({
            isTextBased: () => false,
            type: ChannelType.GuildVoice,
          }),
        },
      });

      await expect(service.validateChannel('guild-1', 'voice-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws when bot lacks required permissions', async () => {
      mockClient.guilds.fetch.mockResolvedValue({
        channels: {
          fetch: jest.fn<any>().mockResolvedValue({
            isTextBased: () => true,
            type: ChannelType.GuildText,
            permissionsFor: () => ({
              has: (perm: bigint) => perm === PermissionsBitField.Flags.ViewChannel,
            }),
          }),
        },
        members: {
          me: { id: 'bot-1' },
          fetchMe: jest.fn(),
        },
      });

      await expect(service.validateChannel('guild-1', 'channel-1')).rejects.toThrow(
        /permissions in the Hall of Fame channel/,
      );
    });

    it('succeeds when channel is valid and permissions are granted', async () => {
      mockClient.guilds.fetch.mockResolvedValue({
        channels: {
          fetch: jest.fn<any>().mockResolvedValue({
            isTextBased: () => true,
            type: ChannelType.GuildText,
            permissionsFor: () => ({
              has: () => true,
            }),
          }),
        },
        members: {
          me: { id: 'bot-1' },
          fetchMe: jest.fn(),
        },
      });

      await expect(service.validateChannel('guild-1', 'channel-1')).resolves.toBeUndefined();
    });
  });

  describe('handleReaction & reconciliation', () => {
    it('ignores non-star emoji reactions', async () => {
      const reaction = {
        emoji: { name: '👍' },
        partial: false,
        message: { guildId: 'guild-1', id: 'msg-1' },
      };

      await service.handleReaction(reaction as any);
      expect(mockPrisma.guildSettings.findUnique).not.toHaveBeenCalled();
    });

    it('creates mirror post and db entry when star threshold is reached', async () => {
      mockPrisma.guildSettings.findUnique.mockResolvedValue({
        hallOfFameEnabled: true,
        hallOfFameChannelId: 'hall-channel-1',
        hallOfFameThreshold: 2,
      });
      mockPrisma.hallOfFameEntry.findUnique.mockResolvedValue(null);

      const mockSentMirror = { id: 'mirror-1' };
      const mockDestinationChannel = {
        id: 'hall-channel-1',
        isTextBased: () => true,
        send: jest.fn<any>().mockResolvedValue(mockSentMirror),
        permissionsFor: () => ({ has: () => true }),
      };

      const mockSourceMessage = {
        id: 'msg-1',
        guildId: 'guild-1',
        channelId: 'source-channel-1',
        content: 'Awesome message!',
        url: 'https://discord.com/channels/1/2/3',
        createdAt: new Date(),
        author: { bot: false, displayName: 'Alice', displayAvatarURL: () => 'https://example.com/avatar.png' },
        attachments: [],
        reactions: {
          cache: [
            {
              emoji: { name: '⭐' },
              users: {
                fetch: jest.fn<any>().mockResolvedValue(
                  new MockCollection([
                    ['u1', { bot: false }],
                    ['u2', { bot: false }],
                    ['bot-1', { bot: true }],
                  ]),
                ),
              },
            },
          ],
        },
      };

      const mockSourceChannel = {
        isTextBased: () => true,
        messages: {
          fetch: jest.fn<any>().mockResolvedValue(mockSourceMessage),
        },
      };

      mockClient.guilds.fetch.mockResolvedValue({
        channels: {
          fetch: jest.fn<any>().mockImplementation((id: string) => {
            if (id === 'source-channel-1') return Promise.resolve(mockSourceChannel);
            if (id === 'hall-channel-1') return Promise.resolve(mockDestinationChannel);
            return Promise.resolve(null);
          }),
        },
        members: {
          me: { id: 'bot-1' },
          fetchMe: jest.fn(),
        },
      });

      const reaction = {
        emoji: { name: '⭐' },
        partial: false,
        message: { guildId: 'guild-1', channelId: 'source-channel-1', id: 'msg-1', partial: false },
      };

      await service.handleReaction(reaction as any);

      expect(mockDestinationChannel.send).toHaveBeenCalledTimes(1);
      expect(mockPrisma.hallOfFameEntry.create).toHaveBeenCalledWith({
        data: {
          guildId: 'guild-1',
          sourceChannelId: 'source-channel-1',
          sourceMessageId: 'msg-1',
          mirrorChannelId: 'hall-channel-1',
          mirrorMessageId: 'mirror-1',
          starCount: 2,
        },
      });
    });

    it('updates existing mirror when reaction count changes', async () => {
      mockPrisma.guildSettings.findUnique.mockResolvedValue({
        hallOfFameEnabled: true,
        hallOfFameChannelId: 'hall-channel-1',
        hallOfFameThreshold: 2,
      });
      mockPrisma.hallOfFameEntry.findUnique.mockResolvedValue({
        id: 'entry-1',
        guildId: 'guild-1',
        sourceChannelId: 'source-channel-1',
        sourceMessageId: 'msg-1',
        mirrorChannelId: 'hall-channel-1',
        mirrorMessageId: 'mirror-1',
        starCount: 2,
      });

      const mockExistingMirror = {
        id: 'mirror-1',
        edit: jest.fn<any>().mockResolvedValue({}),
      };

      const mockDestinationChannel = {
        id: 'hall-channel-1',
        isTextBased: () => true,
        messages: {
          fetch: jest.fn<any>().mockResolvedValue(mockExistingMirror),
        },
        permissionsFor: () => ({ has: () => true }),
      };

      const mockSourceMessage = {
        id: 'msg-1',
        guildId: 'guild-1',
        channelId: 'source-channel-1',
        content: 'Awesome message!',
        url: 'https://discord.com/channels/1/2/3',
        createdAt: new Date(),
        author: { bot: false, displayName: 'Alice', displayAvatarURL: () => 'https://example.com/avatar.png' },
        attachments: [],
        reactions: {
          cache: [
            {
              emoji: { name: '⭐' },
              users: {
                fetch: jest.fn<any>().mockResolvedValue(
                  new MockCollection([
                    ['u1', { bot: false }],
                    ['u2', { bot: false }],
                    ['u3', { bot: false }],
                  ]),
                ),
              },
            },
          ],
        },
      };

      const mockSourceChannel = {
        isTextBased: () => true,
        messages: {
          fetch: jest.fn<any>().mockResolvedValue(mockSourceMessage),
        },
      };

      mockClient.guilds.fetch.mockResolvedValue({
        channels: {
          fetch: jest.fn<any>().mockImplementation((id: string) => {
            if (id === 'source-channel-1') return Promise.resolve(mockSourceChannel);
            if (id === 'hall-channel-1') return Promise.resolve(mockDestinationChannel);
            return Promise.resolve(null);
          }),
        },
        members: {
          me: { id: 'bot-1' },
          fetchMe: jest.fn(),
        },
      });

      const reaction = {
        emoji: { name: '⭐' },
        partial: false,
        message: { guildId: 'guild-1', channelId: 'source-channel-1', id: 'msg-1', partial: false },
      };

      await service.handleReaction(reaction as any);

      expect(mockExistingMirror.edit).toHaveBeenCalledTimes(1);
      expect(mockPrisma.hallOfFameEntry.update).toHaveBeenCalledWith({
        where: { id: 'entry-1' },
        data: { starCount: 3 },
      });
    });

    it('deletes mirror and entry when star count drops below threshold', async () => {
      mockPrisma.guildSettings.findUnique.mockResolvedValue({
        hallOfFameEnabled: true,
        hallOfFameChannelId: 'hall-channel-1',
        hallOfFameThreshold: 3,
      });
      mockPrisma.hallOfFameEntry.findUnique.mockResolvedValue({
        id: 'entry-1',
        guildId: 'guild-1',
        sourceChannelId: 'source-channel-1',
        sourceMessageId: 'msg-1',
        mirrorChannelId: 'hall-channel-1',
        mirrorMessageId: 'mirror-1',
        starCount: 3,
      });

      const mockMirrorMessage = {
        delete: jest.fn<any>().mockResolvedValue({}),
      };

      const mockDestinationChannel = {
        id: 'hall-channel-1',
        isTextBased: () => true,
        messages: {
          fetch: jest.fn<any>().mockResolvedValue(mockMirrorMessage),
        },
      };

      const mockSourceMessage = {
        id: 'msg-1',
        guildId: 'guild-1',
        channelId: 'source-channel-1',
        author: { bot: false },
        reactions: {
          cache: [
            {
              emoji: { name: '⭐' },
              users: {
                fetch: jest.fn<any>().mockResolvedValue(new MockCollection([['u1', { bot: false }]])),
              },
            },
          ],
        },
      };

      mockClient.guilds.fetch.mockResolvedValue({
        channels: {
          fetch: jest.fn<any>().mockImplementation((id: string) => {
            if (id === 'source-channel-1') return Promise.resolve({ isTextBased: () => true, messages: { fetch: jest.fn<any>().mockResolvedValue(mockSourceMessage) } });
            if (id === 'hall-channel-1') return Promise.resolve(mockDestinationChannel);
            return Promise.resolve(null);
          }),
        },
      });

      const reaction = {
        emoji: { name: '⭐' },
        partial: false,
        message: { guildId: 'guild-1', channelId: 'source-channel-1', id: 'msg-1', partial: false },
      };

      await service.handleReaction(reaction as any);

      expect(mockMirrorMessage.delete).toHaveBeenCalledTimes(1);
      expect(mockPrisma.hallOfFameEntry.delete).toHaveBeenCalledWith({
        where: { id: 'entry-1' },
      });
    });

    it('does not mirror messages originating from the Hall of Fame channel itself', async () => {
      mockPrisma.guildSettings.findUnique.mockResolvedValue({
        hallOfFameEnabled: true,
        hallOfFameChannelId: 'hall-channel-1',
        hallOfFameThreshold: 1,
      });
      mockPrisma.hallOfFameEntry.findUnique.mockResolvedValue(null);

      const reaction = {
        emoji: { name: '⭐' },
        partial: false,
        message: { guildId: 'guild-1', channelId: 'hall-channel-1', id: 'msg-in-hall', partial: false },
      };

      await service.handleReaction(reaction as any);
      expect(mockClient.guilds.fetch).not.toHaveBeenCalled();
    });
  });

  describe('handleMessageDelete', () => {
    it('deletes mirror when source message is deleted', async () => {
      mockPrisma.hallOfFameEntry.findUnique.mockResolvedValue({
        id: 'entry-1',
        guildId: 'guild-1',
        sourceChannelId: 'source-channel-1',
        sourceMessageId: 'msg-1',
        mirrorChannelId: 'hall-channel-1',
        mirrorMessageId: 'mirror-1',
      });

      const mockMirrorMessage = {
        delete: jest.fn<any>().mockResolvedValue({}),
      };

      mockClient.guilds.fetch.mockResolvedValue({
        channels: {
          fetch: jest.fn<any>().mockResolvedValue({
            isTextBased: () => true,
            messages: { fetch: jest.fn<any>().mockResolvedValue(mockMirrorMessage) },
          }),
        },
      });

      await service.handleMessageDelete({
        guildId: 'guild-1',
        channelId: 'source-channel-1',
        id: 'msg-1',
      } as any);

      expect(mockMirrorMessage.delete).toHaveBeenCalledTimes(1);
      expect(mockPrisma.hallOfFameEntry.delete).toHaveBeenCalledWith({ where: { id: 'entry-1' } });
    });
  });

  describe('cleanupGuild', () => {
    it('deletes mirror messages and records for guild', async () => {
      mockPrisma.hallOfFameEntry.findMany.mockResolvedValue([
        { id: 'entry-1', mirrorChannelId: 'mirror-ch-1', mirrorMessageId: 'mirror-msg-1' },
      ]);

      const mockMirrorMessage = { delete: jest.fn<any>().mockResolvedValue({}) };
      mockClient.guilds.fetch.mockResolvedValue({
        channels: {
          fetch: jest.fn<any>().mockResolvedValue({
            isTextBased: () => true,
            messages: { fetch: jest.fn<any>().mockResolvedValue(mockMirrorMessage) },
          }),
        },
      });

      await service.cleanupGuild('guild-1');

      expect(mockMirrorMessage.delete).toHaveBeenCalledTimes(1);
      expect(mockPrisma.hallOfFameEntry.deleteMany).toHaveBeenCalledWith({
        where: { guildId: 'guild-1' },
      });
    });
  });
});
