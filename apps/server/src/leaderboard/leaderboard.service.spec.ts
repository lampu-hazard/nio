import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { LeaderboardService } from './leaderboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordBotService } from '../discord/discord-bot.service';

describe('LeaderboardService', () => {
  let service: LeaderboardService;

  const mockPrisma = {
    discordMessageLog: {
      groupBy: jest.fn(async () => [
        { authorId: '12345678901', _count: { id: 10 } },
        { authorId: 'user-2', _count: { id: 5 } },
        { authorId: 'user-3', _count: { id: 2 } },
      ]),
    },
    voiceSession: {
      groupBy: jest.fn(async () => [
        { userId: '12345678901', _sum: { duration: 3600 } },
        { userId: 'user-2', _sum: { duration: 1800 } },
        { userId: 'user-3', _sum: { duration: 600 } },
      ]),
    },
    user: {
      findUnique: jest.fn(async (params: { where: { id: string } }) => {
        if (params.where.id === '12345678901') {
          return { id: '12345678901', username: 'andi', globalName: 'Andi User', avatar: 'avatar1' };
        }
        return null;
      }),
    },
  };

  const mockDiscordBot = {
    client: {
      users: {
        cache: {
          get: jest.fn((id: string) => {
            if (id === 'user-2') {
              return {
                id: 'user-2',
                username: 'budi_discord',
                globalName: 'Budi Discord',
                displayAvatarURL: () => 'https://discord-avatar.com/budi.png',
              };
            }
            return null;
          }),
        },
        fetch: jest.fn(async (id: string) => {
          if (id === 'user-2') {
            return {
              id: 'user-2',
              username: 'budi_discord',
              globalName: 'Budi Discord',
              displayAvatarURL: () => 'https://discord-avatar.com/budi.png',
            };
          }
          throw new Error('Not found');
        }),
      },
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaderboardService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DiscordBotService, useValue: mockDiscordBot },
      ],
    }).compile();

    service = module.get<LeaderboardService>(LeaderboardService);
  });

  it('generates chat leaderboard resolving usernames with fallback logic', async () => {
    const result = await service.getChatLeaderboard('guild-1', '7', 10);
    expect(result).toHaveLength(3);
    // User-1 resolved from Local DB (avatar converted to full url)
    expect(result[0]).toEqual({
      rank: 1,
      userId: '12345678901',
      username: 'andi',
      displayName: 'Andi User',
      avatar: 'https://cdn.discordapp.com/avatars/12345678901/avatar1.png',
      score: 10,
    });
    // User-2 resolved from Discord API
    expect(result[1]).toEqual({
      rank: 2,
      userId: 'user-2',
      username: 'budi_discord',
      displayName: 'Budi Discord',
      avatar: 'https://discord-avatar.com/budi.png',
      score: 5,
    });
    // User-3 falls back to User#user string and dynamic fallback avatar
    expect(result[2]).toEqual({
      rank: 3,
      userId: 'user-3',
      username: 'User#user',
      displayName: 'User#user',
      avatar: expect.stringContaining('https://cdn.discordapp.com/embed/avatars/'),
      score: 2,
    });
  });

  it('generates voice leaderboard resolving usernames with fallback logic', async () => {
    const result = await service.getVoiceLeaderboard('guild-1', '7', 10);
    expect(result).toHaveLength(3);
    // User-1 resolved from Local DB (avatar converted to full url)
    expect(result[0]).toEqual({
      rank: 1,
      userId: '12345678901',
      username: 'andi',
      displayName: 'Andi User',
      avatar: 'https://cdn.discordapp.com/avatars/12345678901/avatar1.png',
      score: 3600,
    });
    // User-2 resolved from Discord API
    expect(result[1]).toEqual({
      rank: 2,
      userId: 'user-2',
      username: 'budi_discord',
      displayName: 'Budi Discord',
      avatar: 'https://discord-avatar.com/budi.png',
      score: 1800,
    });
    // User-3 falls back to User#user string and dynamic fallback avatar
    expect(result[2]).toEqual({
      rank: 3,
      userId: 'user-3',
      username: 'User#user',
      displayName: 'User#user',
      avatar: expect.stringContaining('https://cdn.discordapp.com/embed/avatars/'),
      score: 600,
    });
  });
});
