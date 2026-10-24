import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AgentRunService } from './agent-run.service';

describe('AgentRunService', () => {
  const events: any[] = [];
  const mockPrisma = {
    agentRun: {
      create: jest.fn<any>(async () => ({ id: 'run-1' })),
      findUnique: jest.fn<any>(async () => ({ status: 'INVESTIGATING' })),
      update: jest.fn<any>(async () => ({})),
      deleteMany: jest.fn<any>(async () => ({ count: 0 })),
    },
    agentRunEvent: {
      count: jest.fn<any>(async () => events.length),
      create: jest.fn<any>(async ({ data }: any) => { events.push(data); return data; }),
    },
  };
  let service: AgentRunService;

  beforeEach(() => {
    events.length = 0;
    jest.clearAllMocks();
    mockPrisma.agentRun.findUnique.mockResolvedValue({ status: 'INVESTIGATING' });
    service = new AgentRunService(mockPrisma as any);
  });

  it('persists bounded evidence with sensitive values redacted and mass mentions neutralized', async () => {
    await service.evidence('run-1', 'lookup', 'SUCCESS', `token=abcdefghijk @everyone ${'x'.repeat(1200)}`);
    expect(events[0].summary).not.toContain('abcdefghijk');
    expect(events[0].summary).not.toContain('@everyone');
    expect(events[0].summary.length).toBeLessThanOrEqual(1000);
  });

  it('does not transition a finished run back into an active stage', async () => {
    mockPrisma.agentRun.findUnique.mockResolvedValueOnce({ status: 'COMPLETED' });
    await service.stage('run-1', 'INVESTIGATING', 'ignored');
    expect(mockPrisma.agentRun.update).not.toHaveBeenCalled();
    expect(mockPrisma.agentRunEvent.create).not.toHaveBeenCalled();
  });

  it('assigns unique sequences to concurrent evidence events', async () => {
    mockPrisma.agentRunEvent.count.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return events.length;
    });
    await Promise.all([1, 2, 3].map((i) => service.evidence('run-1', `t${i}`, 'SUCCESS', 'ok')));
    expect(events.map((e) => e.sequence)).toEqual([1, 2, 3]);
  });

  it('keeps awaiting-approval runs open and expires old runs within retention', async () => {
    await service.finish('run-1', 'AWAITING_APPROVAL', 'waiting');
    expect(mockPrisma.agentRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'AWAITING_APPROVAL', completedAt: null } }));
    expect(mockPrisma.agentRun.deleteMany).toHaveBeenCalledTimes(0);
  });
});
