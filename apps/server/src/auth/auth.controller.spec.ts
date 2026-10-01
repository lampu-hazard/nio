import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController OAuth callback', () => {
  const frontendUrl = 'http://frontend.test';
  let originalFrontendUrl: string | undefined;
  let originalOwnerFrontendUrl: string | undefined;
  let originalOwnerRedirectUri: string | undefined;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalFrontendUrl = process.env.FRONTEND_URL;
    originalOwnerFrontendUrl = process.env.OWNER_FRONTEND_URL;
    originalOwnerRedirectUri = process.env.OWNER_DISCORD_REDIRECT_URI;
    originalNodeEnv = process.env.NODE_ENV;
    process.env.FRONTEND_URL = frontendUrl;
    process.env.OWNER_FRONTEND_URL = 'https://ops.test';
    process.env.OWNER_DISCORD_REDIRECT_URI = 'https://ops.test/auth/discord/callback';
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
    if (originalOwnerFrontendUrl === undefined) delete process.env.OWNER_FRONTEND_URL;
    else process.env.OWNER_FRONTEND_URL = originalOwnerFrontendUrl;
    if (originalOwnerRedirectUri === undefined) delete process.env.OWNER_DISCORD_REDIRECT_URI;
    else process.env.OWNER_DISCORD_REDIRECT_URI = originalOwnerRedirectUri;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('saves the OAuth state and client before redirecting to Discord', async () => {
    const authService = { getDiscordLoginUrl: () => 'https://discord.test/oauth' };
    const controller = new AuthController(authService as unknown as AuthService);
    const req = { session: { save: jest.fn((done: () => void) => done()) } };
    const res = { redirect: jest.fn() };

    await controller.login(req as any, res as any);

    expect(req.session.save).toHaveBeenCalled();
    expect(req.session.oauthClient).toBe('client');
    expect(res.redirect).toHaveBeenCalledWith('https://discord.test/oauth');
  });

  it('redirects invalid OAuth state to a generic frontend error page', async () => {
    const controller = new AuthController({} as AuthService);
    const req = { session: { oauthState: 'expected-state', oauthClient: 'client' } };
    const res = { redirect: jest.fn() };

    await controller.callback(req as any, res as any, 'code', 'wrong-state');

    expect(res.redirect).toHaveBeenCalledWith(`${frontendUrl}/?authError=1`);
  });

  it('redirects OAuth callback failures to the same generic frontend error page', async () => {
    const authService = { exchangeCode: async () => { throw new Error('Discord failed'); } };
    const controller = new AuthController(authService as unknown as AuthService);
    const req = { session: { oauthState: 'expected-state', oauthClient: 'client' } };
    const res = { redirect: jest.fn() };

    await controller.callback(req as any, res as any, 'code', 'expected-state');

    expect(res.redirect).toHaveBeenCalledWith(`${frontendUrl}/?authError=1`);
  });

  it('saves the logged-in session before redirecting to dashboard', async () => {
    const authService = {
      exchangeCode: async () => ({ access_token: 'token' }),
      fetchUser: async () => ({ id: 'user-id', username: 'test-user', global_name: null, avatar: null }),
      fetchGuilds: async () => [{ id: 'guild-id' }],
      upsertUser: async () => ({ id: 'user-id', username: 'test-user', globalName: null, avatar: null }),
      avatarUrl: () => 'avatar-url',
    };
    const controller = new AuthController(authService as unknown as AuthService);
    const req = { session: { oauthState: 'expected-state', oauthClient: 'client', save: jest.fn((done: () => void) => done()) } };
    const res = { redirect: jest.fn() };

    await controller.callback(req as any, res as any, 'code', 'expected-state');

    expect(req.session.save).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(`${frontendUrl}/dashboard`);
  });

  it('redirects a successful owner login to the owner frontend', async () => {
    const authService = {
      exchangeCode: async () => ({ access_token: 'token' }),
      fetchUser: async () => ({ id: 'owner-id', username: 'test-owner', global_name: null, avatar: null }),
      fetchGuilds: async () => [],
      upsertUser: async () => ({ id: 'owner-id', username: 'test-owner', globalName: null, avatar: null }),
      avatarUrl: () => 'avatar-url',
    };
    const controller = new AuthController(authService as unknown as AuthService);
    const req = { session: { oauthState: 'expected-state', oauthClient: 'owner', save: jest.fn((done: () => void) => done()) } };
    const res = { redirect: jest.fn() };

    await controller.callback(req as any, res as any, 'code', 'expected-state');

    expect(res.redirect).toHaveBeenCalledWith('https://ops.test');
  });
});
