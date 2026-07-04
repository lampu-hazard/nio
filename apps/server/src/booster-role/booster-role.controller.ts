import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, SessionUser } from '../common/decorators/current-user.decorator';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { BoosterRoleService } from './booster-role.service';
import { ClaimRoleDto } from './dto/claim-role.dto';

@UseGuards(SessionAuthGuard)
@Controller('guilds/:guildId/booster-role')
export class BoosterRoleController {
  constructor(private readonly boosterRoles: BoosterRoleService) {}

  @Get('validate-token')
  async validateToken(
    @Param('guildId') guildId: string,
    @Query('token') token: string,
    @CurrentUser() user: SessionUser,
  ) {
    if (!token) throw new BadRequestException('Missing booster role token.');
    const validation = await this.boosterRoles.validateToken(guildId, token, user.id);
    return { ok: true, validation };
  }

  @Post('claim')
  async claimRole(
    @Param('guildId') guildId: string,
    @Body() dto: ClaimRoleDto,
    @CurrentUser() user: SessionUser,
  ) {
    const role = await this.boosterRoles.claimRole(guildId, dto.token, user.id, dto.name, dto.color);
    return {
      ok: true,
      role: {
        roleId: role.roleId,
        name: role.name,
        color: role.color,
      },
    };
  }
}
