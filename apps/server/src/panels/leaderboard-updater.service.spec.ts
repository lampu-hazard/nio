import { describe, expect, it, jest } from '@jest/globals';
import { LeaderboardUpdaterService } from './leaderboard-updater.service';

describe('leaderboard publish coordination', () => {
  it('uses the revision-aware coordinator for scheduled updates', async () => {
    const publish = jest.fn(async (..._args: any[]) => ({ messageId: 'm' }));
    const updater = new LeaderboardUpdaterService({ panel: { findMany: async () => [{ id: 'p', guildId: '123', revision: 7 }] } } as any, { publish } as any, {} as any, { log() {}, error() {} } as any);
    await updater.updatePublishedLeaderboards();
    expect(publish).toHaveBeenCalledWith('123', 'p', 'system', 7);
  });
});
