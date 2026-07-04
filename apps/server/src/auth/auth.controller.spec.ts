import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController OAuth callback', () => {
  const frontendUrl = 'http://frontend.test';
  let originalFrontendUrl: string | undefined;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalFrontendUrl = process.env.FRONTEND_URL;
    originalNodeEnv = process.env.NODE_ENV;
    process.env.FRONTEND_URL = frontendUrl;
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('saves the OAuth state before redirecting to Discord', async () => {
    const authService = { getDiscordLoginUrl: () => 'https://discord.test/oauth' };
    const controller = new AuthController(authService as unknown as AuthService);
    const req = { session: { save: jest.fn((done: () => void) => done()) } };
    const res = { redirect: jest.fn() };

    await controller.login(req as any, res as any);

    expect(req.session.save).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('https://discord.test/oauth');
  });

  it('redirects invalid OAuth state to a generic frontend error page', async () => {
    const controller = new AuthController({} as AuthService);
    const req = { session: { oauthState: 'expected-state' } };
    const res = { redirect: jest.fn() };

    await controller.callback(req as any, res as any, 'code', 'wrong-state');

    expect(res.redirect).toHaveBeenCalledWith(`${frontendUrl}/?authError=1`);
  });

  it('redirects OAuth callback failures to the same generic frontend error page', async () => {
    const authService = { exchangeCode: async () => { throw new Error('Discord failed'); } };
    const controller = new AuthController(authService as unknown as AuthService);
    const req = { session: { oauthState: 'expected-state' } };
    const res = { redirect: jest.fn() };

    await controller.callback(req as any, res as any, 'code', 'expected-state');

    expect(res.redirect).toHaveBeenCalledWith(`${frontendUrl}/?authError=1`);
  });

  it('saves the logged-in session before redirecting to dashboard', async () => {
    const authService = {
      exchangeCode: async () => ({ access_token: 'token' }),
      fetchUser: async () => ({ id: 'user-id', username: 'wign', global_name: null, avatar: null }),
      fetchGuilds: async () => [{ id: 'guild-id' }],
      upsertUser: async () => ({ id: 'user-id', username: 'wign', globalName: null, avatar: null }),
      avatarUrl: () => 'avatar-url',
    };
    const controller = new AuthController(authService as unknown as AuthService);
    const req = { session: { oauthState: 'expected-state', save: jest.fn((done: () => void) => done()) } };
    const res = { redirect: jest.fn() };

    await controller.callback(req as any, res as any, 'code', 'expected-state');

    expect(req.session.save).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(`${frontendUrl}/dashboard`);
  });
});
