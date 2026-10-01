import { Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('discord')
  async login(@Req() req: Request, @Res() res: Response, @Query('client') clientQuery?: string) {
    const client = clientQuery === 'owner' ? 'owner' : 'client';
    if (clientQuery && clientQuery !== 'owner' && clientQuery !== 'client') return res.status(400).send('Invalid client.');
    if (client === 'owner' && !process.env.OWNER_DISCORD_REDIRECT_URI) return res.status(404).send('Owner login is not configured.');
    const state = randomBytes(24).toString('hex');
    req.session.oauthState = state;
    req.session.oauthClient = client;
    await this.saveSession(req);
    return res.redirect(this.authService.getDiscordLoginUrl(state, client));
  }

  @Get('discord/callback')
  async callback(@Req() req: Request, @Res() res: Response, @Query('code') code?: string, @Query('state') state?: string) {
    const client = req.session.oauthClient === 'owner' ? 'owner' : 'client';
    if (!req.session.oauthClient) return res.status(400).send('OAuth session is missing. Start login again.');
    const frontendUrl = client === 'owner'
      ? (process.env.OWNER_FRONTEND_URL || '')
      : (process.env.FRONTEND_URL || 'http://localhost:3000');
    if (client === 'owner' && !this.isOwnerFrontendUrl(frontendUrl)) {
      return res.status(500).send('Owner frontend URL must be an HTTPS origin.');
    }
    const failureUrl = `${frontendUrl}/?authError=1`;
    if (!code) return res.redirect(failureUrl);
    if (!state || !req.session.oauthState || state !== req.session.oauthState) {
      return res.redirect(failureUrl);
    }

    try {
      const token = await this.authService.exchangeCode(code, client);
      const [discordUser, guilds] = await Promise.all([
        this.authService.fetchUser(token.access_token),
        this.authService.fetchGuilds(token.access_token),
      ]);

      const user = await this.authService.upsertUser(discordUser);
      req.session.user = {
        id: user.id,
        username: user.username,
        globalName: user.globalName,
        avatar: user.avatar,
        avatarUrl: this.authService.avatarUrl(user),
      };
      req.session.guilds = guilds;
      req.session.oauthState = undefined;
      await this.saveSession(req);

      return res.redirect(client === 'owner' ? frontendUrl : `${frontendUrl}/dashboard`);
    } catch (error) {
      console.error('[OAuth callback error]', error);
      return res.redirect(`${frontendUrl}/?authError=1`);
    }
  }

  @UseGuards(SessionAuthGuard)
  @Get('me')
  me(@CurrentUser() user: unknown, @Req() req: Request) {
    console.log('[DEBUG GET ME]', {
      incomingCookies: req.cookies,
      sessionID: req.sessionID,
      hasUser: !!req.session?.user,
    });
    return { ok: true, user, guilds: req.session.guilds || [] };
  }

  @Post('logout')
  logout(@Req() req: Request, @Res() res: Response) {
    req.session.destroy(() => res.json({ ok: true }));
  }

  private isOwnerFrontendUrl(value: string) {
    try {
      const url = new URL(value);
      return url.origin === value && (url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost'));
    } catch {
      return false;
    }
  }

  private saveSession(req: Request) {
    return new Promise<void>((resolve, reject) => {
      req.session.save((error) => error ? reject(error) : resolve());
    });
  }
}
