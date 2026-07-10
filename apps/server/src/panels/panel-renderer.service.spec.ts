import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { PanelRendererService } from './panel-renderer.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';

describe('PanelRendererService', () => {
  let service: PanelRendererService;

  const mockLeaderboard = {
    getChatLeaderboard: jest.fn(async (..._args: any[]) => [
      { rank: 1, userId: 'user-1', username: 'andi', displayName: 'Andi User', avatar: null, score: 100 },
      { rank: 2, userId: 'user-2', username: 'budi', displayName: 'Budi User', avatar: null, score: 50 },
    ]),
    getVoiceLeaderboard: jest.fn(async (..._args: any[]) => [
      { rank: 1, userId: 'user-1', username: 'andi', displayName: 'Andi User', avatar: null, score: 3600 },
    ]),
  };

  const mockGuild = {
    name: 'Test Guild',
    iconURL: jest.fn(() => 'https://guild-icon.com/icon.png'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PanelRendererService,
        { provide: LeaderboardService, useValue: mockLeaderboard },
      ],
    }).compile();

    service = module.get<PanelRendererService>(PanelRendererService);
  });

  it('renders a standard self role panel with embeds and buttons', async () => {
    const panel = {
      id: 'panel-1',
      type: 'SELF_ROLE',
      title: 'Choose Roles',
      color: '#ff0000',
      style: 'PREMIUM',
      accentText: 'Warning',
      description: 'Choose below',
      roles: [
        { id: 'opt-1', roleId: 'role-1', label: 'VIP', emoji: '⭐', buttonStyle: 'PRIMARY' },
      ],
    };

    const res = await service.render(panel, mockGuild as any);
    expect(res.embeds).toHaveLength(1);
    expect(res.embeds[0].data.title).toBe('Choose Roles');
    expect(res.components).toHaveLength(1);
  });

  it('renders a chat leaderboard panel with podium indicators', async () => {
    const panel = {
      id: 'panel-2',
      type: 'LEADERBOARD',
      title: 'Top Chatters',
      name: 'Chat Leaderboard',
      color: '#00ff00',
      style: 'MINIMAL',
      description: 'Weekly active chatters',
      guildId: 'guild-1',
    };

    const res = await service.render(panel, mockGuild as any);
    expect(res.embeds[0].data.description).toContain('🥇 <@user-1> — `100 pesan`');
    expect(res.embeds[0].data.description).toContain('🥈 <@user-2> — `50 pesan`');
    expect(mockLeaderboard.getChatLeaderboard).toHaveBeenCalledWith('guild-1', '7', 10);
  });

  it('renders a voice leaderboard panel with formatted duration', async () => {
    const panel = {
      id: 'panel-3',
      type: 'LEADERBOARD',
      title: 'Top Voice Users',
      name: 'Voice Leaderboard',
      color: '#0000ff',
      style: 'PREMIUM',
      description: 'Weekly active voice users',
      guildId: 'guild-1',
    };

    const res = await service.render(panel, mockGuild as any);
    expect(res.embeds[0].data.description).toContain('🥇 <@user-1> — `1h 0m`');
    expect(mockLeaderboard.getVoiceLeaderboard).toHaveBeenCalledWith('guild-1', '7', 10);
  });
});
