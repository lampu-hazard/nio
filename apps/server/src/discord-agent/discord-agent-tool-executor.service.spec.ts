import { Test, TestingModule } from '@nestjs/testing';
import { DiscordAgentToolExecutorService } from './discord-agent-tool-executor.service';
import { ModerationService } from '../moderation/moderation.service';
import { GuildsService } from '../guilds/guilds.service';
import { AgentActionProposalService } from './agent-action-proposal.service';
import { DiscordMessageLogService } from './discord-message-log.service';

describe('DiscordAgentToolExecutorService', () => {
  let service: DiscordAgentToolExecutorService;

  const mockModeration = {
    listWarnings: jest.fn().mockResolvedValue([{ id: 'warn-1' }]),
  };

  const mockGuilds = {
    getSettings: jest.fn().mockResolvedValue({ logChannelId: 'channel-1' }),
  };

  const mockProposals = {
    createProposal: jest.fn().mockResolvedValue({ id: 'proposal-1', actionType: 'WARN' }),
  };

  const mockMessageLogs = {
    getUserRecentMessages: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordAgentToolExecutorService,
        { provide: ModerationService, useValue: mockModeration },
        { provide: GuildsService, useValue: mockGuilds },
        { provide: AgentActionProposalService, useValue: mockProposals },
        { provide: DiscordMessageLogService, useValue: mockMessageLogs },
      ],
    }).compile();

    service = module.get(DiscordAgentToolExecutorService);
  });

  it('executes read tools immediately', async () => {
    const res = await service.execute('get_user_warnings', { targetUserId: 'user-1' }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });
    expect(res).toEqual([{ id: 'warn-1' }]);
    expect(mockModeration.listWarnings).toHaveBeenCalledWith('guild-1', { search: 'user-1' });
  });

  it('creates proposals for write tools', async () => {
    const res = await service.execute('warn_user', { targetUserId: 'user-1', reason: 'spam' }, { guildId: 'guild-1', requestedById: 'admin-1', channelId: 'channel-1' });
    expect(res).toEqual({ proposalCreated: true, proposalId: 'proposal-1', actionType: 'WARN' });
  });
});
