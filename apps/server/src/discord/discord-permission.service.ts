import { Injectable } from '@nestjs/common';
import { Guild, PermissionsBitField, Role } from 'discord.js';

@Injectable()
export class DiscordPermissionService {
  async botCanManageRole(guild: Guild, role: Role): Promise<boolean> {
    const me = guild.members.me || await guild.members.fetchMe();
    return me.permissions.has(PermissionsBitField.Flags.ManageRoles) && role.position < me.roles.highest.position;
  }

  async missingPanelPermissions(guild: Guild): Promise<string[]> {
    const me = guild.members.me || await guild.members.fetchMe();
    const missing: string[] = [];
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) missing.push('ManageRoles');
    if (!me.permissions.has(PermissionsBitField.Flags.SendMessages)) missing.push('SendMessages');
    if (!me.permissions.has(PermissionsBitField.Flags.EmbedLinks)) missing.push('EmbedLinks');
    return missing;
  }
}
