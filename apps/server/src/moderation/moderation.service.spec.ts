import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ModerationService } from './moderation.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ModerationService', () => {
  let service: ModerationService;
  let prisma: any;
  let originalToken: string | undefined;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalToken = process.env.DISCORD_BOT_TOKEN;
    originalFetch = globalThis.fetch;
    process.env.DISCORD_BOT_TOKEN = 'bot-token';

    prisma = {
      warning: {
        findMany: jest.fn(),
      },
      guildSettings: {
        findUnique: jest.fn(),
      },
    };

    service = new ModerationService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    process.env.DISCORD_BOT_TOKEN = originalToken;
    globalThis.fetch = originalFetch;
  });

  it('returns warning logs enriched with offender and moderator profile details', async () => {
    const createdAt = new Date('2026-07-04T12:00:00.000Z');
    const expiresAt = new Date('2026-08-03T12:00:00.000Z');
    prisma.warning.findMany.mockResolvedValue([
      {
        id: 'warn-1',
        guildId: 'guild-1',
        userId: 'user-1',
        moderatorId: 'mod-1',
        reason: 'kkk',
        createdAt,
        expiresAt,
      },
    ]);

    globalThis.fetch = jest.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.endsWith('/users/user-1')) {
        return {
          ok: true,
          json: async () => ({
            id: 'user-1',
            username: 'offender',
            global_name: 'Offender Name',
            avatar: 'avatar-user',
          }),
        } as Response;
      }

      if (url.endsWith('/users/mod-1')) {
        return {
          ok: true,
          json: async () => ({
            id: 'mod-1',
            username: 'moderator',
            global_name: null,
            avatar: 'a_avatar-mod',
          }),
        } as Response;
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof globalThis.fetch;

    const result = await service.listWarningsWithProfiles('guild-1', { status: 'all', sort: 'newest' });

    expect(result).toEqual([
      {
        id: 'warn-1',
        guildId: 'guild-1',
        userId: 'user-1',
        moderatorId: 'mod-1',
        reason: 'kkk',
        createdAt,
        expiresAt,
        user: {
          id: 'user-1',
          username: 'offender',
          displayName: 'Offender Name',
          avatarUrl: 'https://cdn.discordapp.com/avatars/user-1/avatar-user.png?size=64',
        },
        moderator: {
          id: 'mod-1',
          username: 'moderator',
          displayName: 'moderator',
          avatarUrl: 'https://cdn.discordapp.com/avatars/mod-1/a_avatar-mod.gif?size=64',
        },
      },
    ]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch).toHaveBeenCalledWith('https://discord.com/api/v10/users/user-1', {
      headers: { Authorization: 'Bot bot-token' },
    });
  });

  it('falls back to id-only profile details when Discord profile lookup fails', async () => {
    prisma.warning.findMany.mockResolvedValue([
      {
        id: 'warn-1',
        guildId: 'guild-1',
        userId: 'user-1',
        moderatorId: 'mod-1',
        reason: 'kkk',
        createdAt: new Date('2026-07-04T12:00:00.000Z'),
        expiresAt: null,
      },
    ]);

    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 404 })) as typeof globalThis.fetch;

    const result = await service.listWarningsWithProfiles('guild-1', {});

    expect(result[0].user).toEqual({
      id: 'user-1',
      username: null,
      displayName: null,
      avatarUrl: null,
    });
    expect(result[0].moderator).toEqual({
      id: 'mod-1',
      username: null,
      displayName: null,
      avatarUrl: null,
    });
  });
});
