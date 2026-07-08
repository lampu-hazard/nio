import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, SessionUser } from '../common/decorators/current-user.decorator';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { GuildAccessGuard } from '../guilds/guards/guild-access.guard';
import { BoosterRoleService } from './booster-role.service';
import { ClaimRoleDto } from './dto/claim-role.dto';

@Controller('guilds/:guildId/booster-role')
export class BoosterRoleController {
  constructor(private readonly boosterRoles: BoosterRoleService) {}

  @Get('validate-token')
  async validateToken(
    @Param('guildId') guildId: string,
    @Query('token') token: string,
  ) {
    if (!token) throw new BadRequestException('Missing booster role token.');
    const validation = await this.boosterRoles.validateToken(guildId, token);
    return { ok: true, validation };
  }

  @Post('claim')
  async claimRole(
    @Param('guildId') guildId: string,
    @Body() dto: ClaimRoleDto,
  ) {
    const role = await this.boosterRoles.claimRole(guildId, dto.token, dto.name, {
      primaryColor: dto.primaryColor || dto.color || '#ffffff',
      secondaryColor: dto.secondaryColor,
      tertiaryColor: dto.tertiaryColor,
      iconDataUrl: dto.iconDataUrl,
      removeIcon: dto.removeIcon,
    });
    return {
      ok: true,
      role: {
        roleId: role.roleId,
        name: role.name,
        color: role.color,
        primaryColor: role.primaryColor,
        secondaryColor: role.secondaryColor,
        tertiaryColor: role.tertiaryColor,
        iconUrl: role.iconUrl,
      },
    };
  }

  @UseGuards(SessionAuthGuard, GuildAccessGuard)
  @Get('roles')
  async listRoles(@Param('guildId') guildId: string) {
    return { ok: true, roles: await this.boosterRoles.listCustomRoles(guildId) };
  }

  @UseGuards(SessionAuthGuard, GuildAccessGuard)
  @Delete('roles/:id')
  async deleteRole(@Param('guildId') guildId: string, @Param('id') id: string) {
    await this.boosterRoles.deleteCustomRole(guildId, id);
    return { ok: true };
  }
}
