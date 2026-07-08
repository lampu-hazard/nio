import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { LeaderboardService } from './leaderboard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('LeaderboardService', () => {
  let service: LeaderboardService;

  const mockPrisma = {
    discordMessageLog: {
      groupBy: jest.fn(async () => [
        { authorId: 'user-1', _count: { id: 10 } },
        { authorId: 'user-2', _count: { id: 5 } },
      ]),
    },
    voiceSession: {
      groupBy: jest.fn(async () => [
        { userId: 'user-1', _sum: { duration: 3600 } },
        { userId: 'user-2', _sum: { duration: 1800 } },
      ]),
    },
    user: {
      findUnique: jest.fn(async (params: { where: { id: string } }) => {
        if (params.where.id === 'user-1') {
          return { id: 'user-1', username: 'andi', globalName: 'Andi User', avatar: 'avatar1' };
        }
        return null;
      }),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaderboardService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<LeaderboardService>(LeaderboardService);
  });

  it('generates chat leaderboard resolving usernames', async () => {
    const result = await service.getChatLeaderboard('guild-1', '7', 10);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      rank: 1,
      userId: 'user-1',
      username: 'andi',
      displayName: 'Andi User',
      avatar: 'avatar1',
      score: 10,
    });
    expect(result[1]).toEqual({
      rank: 2,
      userId: 'user-2',
      username: 'User#user',
      displayName: 'User#user',
      avatar: null,
      score: 5,
    });
  });

  it('generates voice leaderboard resolving usernames', async () => {
    const result = await service.getVoiceLeaderboard('guild-1', '7', 10);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      rank: 1,
      userId: 'user-1',
      username: 'andi',
      displayName: 'Andi User',
      avatar: 'avatar1',
      score: 3600,
    });
    expect(result[1]).toEqual({
      rank: 2,
      userId: 'user-2',
      username: 'User#user',
      displayName: 'User#user',
      avatar: null,
      score: 1800,
    });
  });
});
