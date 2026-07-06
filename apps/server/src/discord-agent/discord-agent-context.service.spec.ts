import { Test, TestingModule } from '@nestjs/testing';
import { DiscordAgentContextService } from './discord-agent-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { DiscordMessageLogService } from './discord-message-log.service';

describe('DiscordAgentContextService', () => {
  let service: DiscordAgentContextService;

  const mockPrisma = {
    guildSettings: { findUnique: jest.fn().mockResolvedValue({}) },
  };

  const mockModeration = {
    listWarnings: jest.fn().mockResolvedValue([]),
    countActiveWarnings: jest.fn().mockResolvedValue(0),
    getSettings: jest.fn().mockResolvedValue({ warnLimitEnabled: false }),
  };

  const mockMessageLog = {
    getUserRecentMessages: jest.fn().mockResolvedValue([]),
  };

  const mockClient = {
    guilds: {
      fetch: jest.fn().mockResolvedValue({
        id: 'guild-1',
        name: 'Test Guild',
        members: {
          fetch: jest.fn().mockResolvedValue({
            id: 'user-1',
            user: {
              username: 'target',
              globalName: 'Target User',
              bot: false,
              createdAt: new Date('2024-01-01T00:00:00.000Z'),
              displayAvatarURL: () => 'https://cdn.example/avatar.png',
            },
            joinedAt: new Date('2024-02-01T00:00:00.000Z'),
            premiumSince: null,
            nickname: null,
            communicationDisabledUntil: null,
            roles: { cache: { map: () => [] } },
          }),
        },
      }),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordAgentContextService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ModerationService, useValue: mockModeration },
        { provide: DiscordMessageLogService, useValue: mockMessageLog },
      ],
    }).compile();

    service = module.get<DiscordAgentContextService>(DiscordAgentContextService);
    service.setClient(mockClient as any);
  });

  it('builds a JSON context object representing the target member and moderation status', async () => {
    const context = await service.buildModContext('guild-1', 'user-1');
    expect(context).toHaveProperty('member');
    expect(context).toHaveProperty('warnings');
    expect(context).toHaveProperty('recentMessages');
    expect(context.member).toMatchObject({ id: 'user-1', username: 'target', displayName: 'Target User' });
  });
});
