import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Client, PermissionFlagsBits } from 'discord.js';
import { parseAgentProfile } from './agent-profile.types';

@Injectable()
export class AgentProfileManagerGuard implements CanActivate {
  private client?: Client;
  setClient(client: Client) { this.client = client; }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    // The legacy route is an explicit ADMIN alias, not a runtime default.
    const profile = parseAgentProfile(request.params.profile ?? 'ADMIN');
    if (profile === 'PUBLIC') return true;
    const guildId = request.params.guildId;
    const userId = request.session?.user?.id;
    if (!guildId || !userId || !this.client) throw new ForbiddenException('Current guild management permission required.');
    try {
      const guild = await this.client.guilds.fetch({ guild: guildId, force: true });
      const member = await guild.members.fetch({ user: userId, force: true });
      if (member.guild.id === guildId && (guild.ownerId === userId
        || member.permissions.has(PermissionFlagsBits.ManageGuild)
        || member.permissions.has(PermissionFlagsBits.Administrator))) return true;
    } catch { /* Fail closed rather than trusting session permission snapshots. */ }
    throw new ForbiddenException('Current guild management permission required.');
  }
}
