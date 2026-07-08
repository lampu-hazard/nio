import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get('chat')
  async getChat(
    @Query('guildId') guildId: string,
    @Query('days') days = '7',
    @Query('limit') limit = '50',
  ) {
    if (!guildId) {
      throw new BadRequestException('guildId query parameter is required.');
    }
    if (days !== '7' && days !== '30' && days !== 'all') {
      throw new BadRequestException('days must be 7, 30, or all.');
    }
    const limitNum = parseInt(limit, 10);
    if (isNaN(limitNum) || limitNum <= 0) {
      throw new BadRequestException('limit must be a positive integer.');
    }
    return this.leaderboardService.getChatLeaderboard(guildId, days, limitNum);
  }

  @Get('voice')
  async getVoice(
    @Query('guildId') guildId: string,
    @Query('days') days = '7',
    @Query('limit') limit = '50',
  ) {
    if (!guildId) {
      throw new BadRequestException('guildId query parameter is required.');
    }
    if (days !== '7' && days !== '30' && days !== 'all') {
      throw new BadRequestException('days must be 7, 30, or all.');
    }
    const limitNum = parseInt(limit, 10);
    if (isNaN(limitNum) || limitNum <= 0) {
      throw new BadRequestException('limit must be a positive integer.');
    }
    return this.leaderboardService.getVoiceLeaderboard(guildId, days, limitNum);
  }
}
