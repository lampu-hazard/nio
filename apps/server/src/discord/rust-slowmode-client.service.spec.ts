import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../logger/logger.service';
import { RustSlowmodeClientService } from './rust-slowmode-client.service';

describe('RustSlowmodeClientService', () => {
  let service: RustSlowmodeClientService;
  let configService: any;
  let logger: any;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    configService = {
      get: jest.fn(() => 'http://localhost:8080'),
    };
    logger = {
      error: jest.fn(),
    };
    service = new RustSlowmodeClientService(
      configService as unknown as ConfigService,
      logger as unknown as AppLogger,
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns null when url is empty', async () => {
    configService.get.mockReturnValue('');
    const noUrlService = new RustSlowmodeClientService(
      configService as unknown as ConfigService,
      logger as unknown as AppLogger,
    );
    const result = await noUrlService.analyze('1', '2', '3', 100, 0, { quietSeconds: 0, normalSeconds: 5, busySeconds: 10 });
    expect(result).toBeNull();
  });

  it('successfully returns a decision when the service call succeeds', async () => {
    const mockResponse = {
      level: 'BUSY',
      recommendedSeconds: 10,
      shouldApply: true,
      reason: 'Busy chat rate',
      metrics: {
        messagesIn10s: 8,
        messagesIn60s: 20,
        uniqueUsersIn60s: 3,
      },
    };

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response),
    ) as any;

    const result = await service.analyze('guild1', 'channel1', 'user1', 12345678, 5, {
      quietSeconds: 0,
      normalSeconds: 5,
      busySeconds: 10,
    });

    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/v1/slowmode/analyze', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guildId: 'guild1',
        channelId: 'channel1',
        userId: 'user1',
        timestampMs: 12345678,
        currentSlowmodeSeconds: 5,
        config: { quietSeconds: 0, normalSeconds: 5, busySeconds: 10 },
      }),
    }));
  });

  it('returns null and logs error when status is not ok', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
      } as Response),
    ) as any;

    const result = await service.analyze('guild1', 'channel1', 'user1', 12345678, 5, {
      quietSeconds: 0,
      normalSeconds: 5,
      busySeconds: 10,
    });

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'Slowmode engine HTTP error: 500',
      '',
      'RustSlowmodeClient',
    );
  });

  it('returns null and logs error on request failure', async () => {
    global.fetch = jest.fn(() =>
      Promise.reject(new Error('Network error')),
    ) as any;

    const result = await service.analyze('guild1', 'channel1', 'user1', 12345678, 5, {
      quietSeconds: 0,
      normalSeconds: 5,
      busySeconds: 10,
    });

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to reach slowmode engine: Network error',
      expect.any(String),
      'RustSlowmodeClient',
    );
  });
});
