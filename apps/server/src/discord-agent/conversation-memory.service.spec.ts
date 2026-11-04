import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ConversationMemoryService, ConversationTurn, MAX_TURNS, TTL_SECONDS, KEY_PREFIX } from './conversation-memory.service';

const mockRedisInstance = {
  get: jest.fn(async (_key: string): Promise<string | null> => null),
  set: jest.fn(async (_key: string, _value: string, _mode: string, _ttl: number): Promise<string> => 'OK'),
  del: jest.fn(async (_key: string): Promise<number> => 1),
  connect: jest.fn(async (): Promise<void> => undefined),
  on: jest.fn((_event: string, _handler: () => void) => mockRedisInstance),
  quit: jest.fn(async (): Promise<string> => 'OK'),
};

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn(() => mockRedisInstance),
  };
});

describe('ConversationMemoryService', () => {
  let service: ConversationMemoryService;
  const publicScope = {
    guildId: 'guild-1',
    profile: 'PUBLIC' as const,
    channelId: 'channel-1',
    userId: 'user-1',
  };
  const adminScope = {
    guildId: 'guild-1',
    profile: 'ADMIN' as const,
    channelId: 'channel-admin',
    userId: 'user-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ConversationMemoryService();
  });

  it('returns empty array when key does not exist', async () => {
    mockRedisInstance.get.mockResolvedValueOnce(null);

    const result = await service.loadHistory(publicScope, 'msg-1');

    expect(result).toEqual([]);
    expect(mockRedisInstance.get).toHaveBeenCalledWith(
      `${KEY_PREFIX}v2:guild-1:PUBLIC:channel-1:user-1:msg-1`,
    );
  });

  it('returns parsed turns from Redis', async () => {
    const turns: ConversationTurn[] = [
      { userPrompt: 'hello', aiResponse: 'hi there', timestamp: 1000 },
    ];
    mockRedisInstance.get.mockResolvedValueOnce(JSON.stringify(turns));

    const result = await service.loadHistory(publicScope, 'msg-1');

    expect(result).toEqual(turns);
  });

  it('returns empty array on malformed JSON', async () => {
    mockRedisInstance.get.mockResolvedValueOnce('not-valid-json{{{');

    const result = await service.loadHistory(publicScope, 'msg-1');

    expect(result).toEqual([]);
  });

  it('returns empty array when Redis throws', async () => {
    mockRedisInstance.get.mockRejectedValueOnce(new Error('connection refused'));

    const result = await service.loadHistory(publicScope, 'msg-1');

    expect(result).toEqual([]);
  });

  it('saves turns with v2 scoped key and provenance TTL', async () => {
    const turns: ConversationTurn[] = [
      { userPrompt: 'hello', aiResponse: 'hi', timestamp: 1000 },
    ];

    await service.saveConversation(publicScope, 'msg-2', turns);

    expect(mockRedisInstance.set).toHaveBeenCalledWith(
      `${KEY_PREFIX}v2:guild-1:PUBLIC:channel-1:user-1:msg-2`,
      JSON.stringify(turns),
      'EX',
      TTL_SECONDS,
    );
    expect(mockRedisInstance.set).toHaveBeenCalledWith(
      `${KEY_PREFIX}prov:v2:msg-2`,
      JSON.stringify(publicScope),
      'EX',
      TTL_SECONDS,
    );
  });

  it('isolates PUBLIC and ADMIN history and rejects mismatched user/channel/profile on provenance check', async () => {
    const store = new Map<string, string>();
    mockRedisInstance.set.mockImplementation(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    });
    mockRedisInstance.get.mockImplementation(async (key: string) => store.get(key) ?? null);

    // Legacy key must never be read
    store.set('agent:conv:guild-1:msg-legacy', JSON.stringify([{ userPrompt: 'legacy', aiResponse: 'secret', timestamp: 1 }]));
    expect(await service.loadHistory(publicScope, 'msg-legacy')).toEqual([]);

    await service.saveConversation(adminScope, 'msg-admin', [
      { userPrompt: 'admin secret', aiResponse: 'admin answer', timestamp: 2 },
    ]);

    // PUBLIC scope cannot read ADMIN message
    expect(await service.loadHistory(publicScope, 'msg-admin')).toEqual([]);
    // Different user in ADMIN channel cannot read another user's ADMIN message
    expect(
      await service.loadHistory(
        { ...adminScope, userId: 'other-user' },
        'msg-admin',
      ),
    ).toEqual([]);
    // Exact matching scope succeeds
    expect(await service.loadHistory(adminScope, 'msg-admin')).toEqual([
      { userPrompt: 'admin secret', aiResponse: 'admin answer', timestamp: 2 },
    ]);
    expect(await service.getProvenance('msg-admin')).toEqual(adminScope);
  });

  it('trims oldest turns when exceeding MAX_TURNS', async () => {
    const turns: ConversationTurn[] = Array.from({ length: MAX_TURNS + 5 }, (_, i) => ({
      userPrompt: `q${i}`,
      aiResponse: `a${i}`,
      timestamp: i,
    }));

    await service.saveConversation(publicScope, 'msg-3', turns);

    const savedArg = (mockRedisInstance.set as any).mock.calls[0][1];
    const saved: ConversationTurn[] = JSON.parse(savedArg);
    expect(saved).toHaveLength(MAX_TURNS);
    expect(saved[0].userPrompt).toBe('q5');
    expect(saved[MAX_TURNS - 1].userPrompt).toBe(`q${MAX_TURNS + 4}`);
  });

  it('silently handles save errors', async () => {
    mockRedisInstance.set.mockRejectedValueOnce(new Error('write error'));

    await service.saveConversation(publicScope, 'msg-4', [
      { userPrompt: 'test', aiResponse: 'ok', timestamp: 1000 },
    ]);
  });

  it('disconnects Redis on module destroy', async () => {
    await service.onModuleDestroy();

    expect(mockRedisInstance.quit).toHaveBeenCalled();
  });
});
