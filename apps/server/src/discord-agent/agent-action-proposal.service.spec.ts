import { Test, TestingModule } from '@nestjs/testing';
import { AgentActionProposalService } from './agent-action-proposal.service';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';

describe('AgentActionProposalService', () => {
  const mockPrisma = {
    agentActionProposal: {
      create: jest.fn().mockResolvedValue({ id: 'proposal-1' }),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    discordAgentSettings: {
      findUnique: jest.fn().mockResolvedValue({ enabled: true, allowedUserIds: ['admin-1'] }),
    },
  };

  const mockModeration = {
    createWarning: jest.fn().mockResolvedValue({ id: 'warn-1' }),
  };

  let service: AgentActionProposalService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentActionProposalService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ModerationService, useValue: mockModeration },
      ],
    }).compile();

    service = module.get(AgentActionProposalService);
  });

  it('creates a pending proposal with a 10 minute expiry', async () => {
    await service.createProposal({
      guildId: 'guild-1',
      channelId: 'channel-1',
      requestedById: 'admin-1',
      targetUserId: 'target-1',
      recommendation: { type: 'WARN', reason: 'Spam berulang' },
    });

    expect(mockPrisma.agentActionProposal.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.agentActionProposal.create.mock.calls[0][0].data;
    expect(data.status).toBe('PENDING');
    expect(data.actionType).toBe('WARN');
  });

  it('cancels a pending proposal requested by the same user', async () => {
    mockPrisma.agentActionProposal.findUnique.mockResolvedValue({
      id: 'proposal-1',
      requestedById: 'admin-1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await service.cancelProposal('proposal-1', 'admin-1');
    expect(result.ok).toBe(true);
    expect(mockPrisma.agentActionProposal.update).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      data: { status: 'CANCELLED' },
    });
  });
});
