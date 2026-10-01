import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../logger/logger.service';
import { AppError } from '../common/errors/app-error';

const DISCORD_API = 'https://discord.com/api/v10';

type DiscordUser = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  getDiscordLoginUrl(state: string, client: 'client' | 'owner' = 'client'): string {
    const params = new URLSearchParams({
      client_id: this.requiredEnv('DISCORD_CLIENT_ID'),
      redirect_uri: this.redirectUri(client),
      response_type: 'code',
      scope: 'identify guilds',
      state,
    });
    return `https://discord.com/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string, client: 'client' | 'owner' = 'client') {
    this.logger.debug('Exchanging OAuth code', 'Auth');
    const body = new URLSearchParams({
      client_id: this.requiredEnv('DISCORD_CLIENT_ID'),
      client_secret: this.requiredEnv('DISCORD_CLIENT_SECRET'),
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri(client),
    });

    const response = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      throw new AppError('DISCORD_OAUTH_FAILED', 'Discord OAuth token exchange failed', 502, { status: response.status });
    }

    return response.json() as Promise<{ access_token: string; token_type: string }>;
  }

  async fetchUser(accessToken: string): Promise<DiscordUser> {
    const response = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new AppError('DISCORD_USER_FETCH_FAILED', 'Failed to fetch Discord user', 502);
    return response.json() as Promise<DiscordUser>;
  }

  async fetchGuilds(accessToken: string) {
    const response = await fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new AppError('DISCORD_GUILDS_FETCH_FAILED', 'Failed to fetch Discord guilds', 502);
    return response.json();
  }

  async upsertUser(user: DiscordUser) {
    this.logger.log(`User login: ${user.username} (${user.id})`, 'Auth');
    return this.prisma.user.upsert({
      where: { id: user.id },
      update: { username: user.username, globalName: user.global_name ?? null, avatar: user.avatar ?? null },
      create: { id: user.id, username: user.username, globalName: user.global_name ?? null, avatar: user.avatar ?? null },
    });
  }

  avatarUrl(user: { id: string; avatar?: string | null }) {
    if (!user.avatar) return 'https://cdn.discordapp.com/embed/avatars/0.png';
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
  }

  redirectUri(client: 'client' | 'owner') {
    if (client === 'owner') {
      const ownerUri = process.env.OWNER_DISCORD_REDIRECT_URI?.trim();
      if (!ownerUri) throw new AppError('CONFIG_MISSING', 'Missing OWNER_DISCORD_REDIRECT_URI', 500);
      let parsed: URL;
      try {
        parsed = new URL(ownerUri);
      } catch {
        throw new AppError('CONFIG_INVALID', 'OWNER_DISCORD_REDIRECT_URI must be an absolute URL', 500);
      }
      if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && parsed.hostname === 'localhost')) {
        throw new AppError('CONFIG_INVALID', 'OWNER_DISCORD_REDIRECT_URI must use HTTPS', 500);
      }
      return ownerUri;
    }
    return process.env.DISCORD_REDIRECT_URI || 'http://localhost:3001/auth/discord/callback';
  }

  private requiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new AppError('CONFIG_MISSING', `Missing ${name}`, 500);
    return value;
  }
}
