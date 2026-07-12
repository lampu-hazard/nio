import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser, SessionUser } from '../common/decorators/current-user.decorator';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { GuildAccessGuard } from '../guilds/guards/guild-access.guard';
import { TakoService } from './tako.service';
import { UpdateTakoSettingsDto } from './dto/update-tako-settings.dto';
import { CheckoutTakoDto } from './dto/checkout-tako.dto';

@Controller('guilds/:guildId/tako')
export class TakoController {
  constructor(private readonly takoService: TakoService) {}

  @UseGuards(SessionAuthGuard, GuildAccessGuard)
  @Get('settings')
  async getSettings(@Param('guildId') guildId: string) {
    const settings = await this.takoService.getSettings(guildId);
    return { ok: true, settings };
  }

  @UseGuards(SessionAuthGuard, GuildAccessGuard)
  @Patch('settings')
  async updateSettings(
    @Param('guildId') guildId: string,
    @Body() dto: UpdateTakoSettingsDto,
  ) {
    const settings = await this.takoService.updateSettings(guildId, dto);
    return { ok: true, settings };
  }

  @Get('public-settings')
  async getPublicSettings(@Param('guildId') guildId: string) {
    const settings = await this.takoService.getSettings(guildId);
    return {
      ok: true,
      settings: {
        enabled: settings.enabled,
        minimumAmount: settings.minimumAmount,
        paymentMethods: settings.paymentMethods,
        rewardRoleId: settings.rewardRoleId,
      },
    };
  }

  @Post('checkout')
  async createCheckout(
    @Param('guildId') guildId: string,
    @Body() dto: CheckoutTakoDto,
    @CurrentUser() user?: SessionUser,
  ) {
    const userId = user?.id || dto.discordUserId;
    const username = user?.username || dto.discordUsername;

    if (!userId || !username) {
      throw new BadRequestException('Discord user ID and username are required.');
    }

    const checkout = await this.takoService.createCheckout(guildId, {
      amount: dto.amount,
      email: dto.email,
      paymentMethod: dto.paymentMethod,
      discordUserId: userId,
      discordUsername: username,
      message: dto.message,
    });
    return { ok: true, ...checkout };
  }

  @UseGuards(SessionAuthGuard, GuildAccessGuard)
  @Get('donations')
  async listDonations(@Param('guildId') guildId: string) {
    const donations = await this.takoService.listDonations(guildId);
    return { ok: true, donations };
  }

  @UseGuards(SessionAuthGuard, GuildAccessGuard)
  @Post('donations/:id/retry-role')
  async retryRole(
    @Param('guildId') guildId: string,
    @Param('id') id: string,
  ) {
    const result = await this.takoService.retryRoleAssignment(guildId, id);
    return result;
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Param('guildId') guildId: string,
    @Req() req: Request & { rawBody?: string },
    @Headers('x-tako-signature') signature?: string,
  ) {
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const result = await this.takoService.handleWebhook(guildId, rawBody, signature);
    return { success: true, ...result };
  }
}
