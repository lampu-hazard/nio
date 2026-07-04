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
    console.log('[DEBUG LOGIN START]', {
      incomingCookies: req.cookies,
      hasSession: !!req.session,
      sessionID: req.sessionID,
    });
    const state = randomBytes(24).toString('hex');
    req.session.oauthState = state;
    await this.saveSession(req);

    // Diagnostic log in login
    console.log('[DEBUG LOGIN REDIRECT]', {
      setCookieHeader: typeof res.getHeader === 'function' ? res.getHeader('Set-Cookie') : undefined,
      sessionID: req.sessionID,
    });

    return res.redirect(this.authService.getDiscordLoginUrl(state));
  }

  @Get('discord/callback')
  async callback(@Req() req: Request, @Res() res: Response, @Query('code') code?: string, @Query('state') state?: string) {
    console.log('[DEBUG CALLBACK START]', {
      incomingCookies: req.cookies,
      hasSession: !!req.session,
      sessionID: req.sessionID,
      stateParam: state,
      sessionOauthState: req.session?.oauthState,
    });
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    if (!code) return res.redirect(`${frontendUrl}/?authError=1`);
    const isProd = process.env.NODE_ENV === 'production';
    if (!state || (isProd && req.session.oauthState && state !== req.session.oauthState)) {
      console.warn('[DEBUG CALLBACK STATE MISMATCH OR MISSING]', {
        stateParam: state,
        sessionOauthState: req.session?.oauthState,
      });
      return res.redirect(`${frontendUrl}/?authError=1`);
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

      // Diagnostic log before redirect
      console.log('[DEBUG CALLBACK REDIRECT]', {
        setCookieHeader: typeof res.getHeader === 'function' ? res.getHeader('Set-Cookie') : undefined,
        sessionID: req.sessionID,
        sessionUser: req.session.user,
      });

      return res.redirect(`${frontendUrl}/dashboard`);
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

  private saveSession(req: Request) {
    return new Promise<void>((resolve, reject) => {
      req.session.save((error) => error ? reject(error) : resolve());
    });
  }
}
