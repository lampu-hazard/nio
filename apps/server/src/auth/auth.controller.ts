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
  async login(@Req() req: Request, @Res() res: Response) {
    const state = randomBytes(24).toString('hex');
    req.session.oauthState = state;
    await this.saveSession(req);
    return res.redirect(this.authService.getDiscordLoginUrl(state));
  }

  @Get('discord/callback')
  async callback(@Req() req: Request, @Res() res: Response, @Query('code') code?: string, @Query('state') state?: string) {
    if (!req.session.oauthState) return res.status(400).send('OAuth session is missing. Start login again.');
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const failureUrl = `${frontendUrl}/?authError=1`;
    if (!code) return res.redirect(failureUrl);
    if (!state || !req.session.oauthState || state !== req.session.oauthState) {
      return res.redirect(failureUrl);
    }

    try {
      const token = await this.authService.exchangeCode(code);
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

      return res.redirect(`${frontendUrl}/dashboard`);
    } catch (error) {
      console.error('[OAuth callback error]', error);
      return res.redirect(failureUrl);
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
    const ownerId = process.env.OWNER_DISCORD_ID?.trim();
    return { ok: true, user, guilds: req.session.guilds || [], isOwner: Boolean(ownerId && req.session.user?.id === ownerId) };
  }

  @Post('logout')
  logout(@Req() req: Request, @Res() res: Response) {
    req.session.destroy(() => res.json({ ok: true }));
  }

  private saveSession(req: Request) {
    return new Promise<void>((resolve, reject) => {
      req.session.save((error) => error ? reject(error) : resolve());
    });
  }
}
