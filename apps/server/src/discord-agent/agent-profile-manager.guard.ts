import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { Client, PermissionFlagsBits } from 'discord.js';
import { parseAgentProfile } from './agent-profile.types';
import { AiAgentSettingsService } from './ai-agent-settings.service';

@Injectable()
export class AgentProfileManagerGuard implements CanActivate {
  private client?: Client;

  constructor(@Optional() private readonly settings?: AiAgentSettingsService) {}

  setClient(client: Client) { this.client = client; }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    // The legacy route is an explicit ADMIN alias, not a runtime default.
    const profile = parseAgentProfile(request.params.profile ?? 'ADMIN');
    if (profile === 'PUBLIC') return true;
    const guildId = request.params.guildId;
    const userId = request.session?.user?.id;
    const client = this.client ?? this.settings?.getClient();
    if (!guildId || !userId || !client) throw new ForbiddenException('Current guild management permission required.');
    try {
      const guild = await client.guilds.fetch({ guild: guildId, force: true });
      const member = await guild.members.fetch({ user: userId, force: true });
      if (member.guild.id === guildId && (guild.ownerId === userId
        || member.permissions.has(PermissionFlagsBits.ManageGuild)
        || member.permissions.has(PermissionFlagsBits.Administrator))) return true;
    } catch { /* Fail closed rather than trusting session permission snapshots. */ }
    throw new ForbiddenException('Current guild management permission required.');
  }
}
