import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ConversationMemoryService, ConversationTurn, MAX_TURNS, TTL_SECONDS, KEY_PREFIX, CHANNEL_KEY_PREFIX } from './conversation-memory.service';

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

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ConversationMemoryService();
  });

  it('returns empty array when key does not exist', async () => {
    mockRedisInstance.get.mockResolvedValueOnce(null);

    const result = await service.loadHistory('guild-1', 'msg-1');

    expect(result).toEqual([]);
    expect(mockRedisInstance.get).toHaveBeenCalledWith(`${KEY_PREFIX}guild-1:msg-1`);
  });

  it('returns parsed turns from Redis', async () => {
    const turns: ConversationTurn[] = [
      { userPrompt: 'hello', aiResponse: 'hi there', timestamp: 1000 },
    ];
    mockRedisInstance.get.mockResolvedValueOnce(JSON.stringify(turns));

    const result = await service.loadHistory('guild-1', 'msg-1');

    expect(result).toEqual(turns);
  });

  it('returns empty array on malformed JSON', async () => {
    mockRedisInstance.get.mockResolvedValueOnce('not-valid-json{{{');

    const result = await service.loadHistory('guild-1', 'msg-1');

    expect(result).toEqual([]);
  });

  it('returns empty array when Redis throws', async () => {
    mockRedisInstance.get.mockRejectedValueOnce(new Error('connection refused'));

    const result = await service.loadHistory('guild-1', 'msg-1');

    expect(result).toEqual([]);
  });

  it('saves turns with TTL', async () => {
    const turns: ConversationTurn[] = [
      { userPrompt: 'hello', aiResponse: 'hi', timestamp: 1000 },
    ];

    await service.saveConversation('guild-1', 'msg-2', turns);

    expect(mockRedisInstance.set).toHaveBeenCalledWith(
      `${KEY_PREFIX}guild-1:msg-2`,
      JSON.stringify(turns),
      'EX',
      TTL_SECONDS,
    );
  });

  it('trims oldest turns when exceeding MAX_TURNS', async () => {
    const turns: ConversationTurn[] = Array.from({ length: MAX_TURNS + 5 }, (_, i) => ({
      userPrompt: `q${i}`,
      aiResponse: `a${i}`,
      timestamp: i,
    }));

    await service.saveConversation('guild-1', 'msg-3', turns);

    const savedArg = (mockRedisInstance.set as any).mock.calls[0][1];
    const saved: ConversationTurn[] = JSON.parse(savedArg);
    expect(saved).toHaveLength(MAX_TURNS);
    expect(saved[0].userPrompt).toBe('q5');
    expect(saved[MAX_TURNS - 1].userPrompt).toBe(`q${MAX_TURNS + 4}`);
  });

  it('silently handles save errors', async () => {
    mockRedisInstance.set.mockRejectedValueOnce(new Error('write error'));

    await service.saveConversation('guild-1', 'msg-4', [
      { userPrompt: 'test', aiResponse: 'ok', timestamp: 1000 },
    ]);
  });

  it('loads channel history using channel last key', async () => {
    const turns: ConversationTurn[] = [
      { userPrompt: 'cek user', aiResponse: 'user info', timestamp: 1000 },
    ];
    mockRedisInstance.get.mockResolvedValueOnce(JSON.stringify(turns));

    const result = await service.loadChannelHistory('guild-1', 'channel-1');

    expect(result).toEqual(turns);
    expect(mockRedisInstance.get).toHaveBeenCalledWith(`${CHANNEL_KEY_PREFIX}guild-1:channel-1`);
  });

  it('saves channel history with TTL', async () => {
    const turns: ConversationTurn[] = [
      { userPrompt: 'cek user', aiResponse: 'user info', timestamp: 1000 },
    ];

    await service.saveChannelConversation('guild-1', 'channel-1', turns);

    expect(mockRedisInstance.set).toHaveBeenCalledWith(
      `${CHANNEL_KEY_PREFIX}guild-1:channel-1`,
      JSON.stringify(turns),
      'EX',
      TTL_SECONDS,
    );
  });

  it('disconnects Redis on module destroy', async () => {
    await service.onModuleDestroy();

    expect(mockRedisInstance.quit).toHaveBeenCalled();
  });
});
