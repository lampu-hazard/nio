import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';

const MANAGE_GUILD = 0x20n;
const MANAGE_ROLES = 0x10000000n;
const ADMINISTRATOR = 0x8n;

@Injectable()
export class GuildAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const guildId = req.params.guildId;
    const guild = (req.session.guilds || []).find((g: any) => g.id === guildId);
    if (!guild) throw new AppError('GUILD_ACCESS_DENIED', 'Guild access denied', 403);
    const perms = BigInt(guild.permissions || '0');
    const ok = (perms & ADMINISTRATOR) === ADMINISTRATOR || (perms & MANAGE_GUILD) === MANAGE_GUILD || (perms & MANAGE_ROLES) === MANAGE_ROLES;
    if (!ok) throw new AppError('GUILD_ACCESS_DENIED', 'Guild access denied', 403);
    return true;
  }
}
