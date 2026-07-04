import { describe, expect, it, beforeEach, afterAll, jest } from '@jest/globals';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const prisma = {} as any;
  const logger = { debug: jest.fn(), log: jest.fn() } as any;

  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      DISCORD_CLIENT_ID: 'client-id',
      DISCORD_CLIENT_SECRET: 'client-secret',
      DISCORD_REDIRECT_URI: 'https://hazard.wign.dev/api/auth/discord/callback',
    };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('uses the frontend proxy callback as Discord redirect_uri', () => {
    const service = new AuthService(prisma, logger);

    const url = new URL(service.getDiscordLoginUrl('state-123'));

    expect(url.origin + url.pathname).toBe('https://discord.com/oauth2/authorize');
    expect(url.searchParams.get('redirect_uri')).toBe('https://hazard.wign.dev/api/auth/discord/callback');
    expect(url.searchParams.get('state')).toBe('state-123');
  });
});
