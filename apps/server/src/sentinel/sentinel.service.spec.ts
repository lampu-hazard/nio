import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { SentinelService } from './sentinel.service';
import { AppLogger } from '../logger/logger.service';

describe('SentinelService', () => {
  let service: SentinelService;

  beforeEach(async () => {
    const mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SentinelService,
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<SentinelService>(SentinelService);
    service.onModuleInit();
  });

  describe('Phishing Scanner', () => {
    it('should allow legitimate discord domains', () => {
      const res = service.scanPhishing('https://discord.com/channels/123/456');
      expect(res.isSuspicious).toBe(false);
      expect(res.reasons.length).toBe(0);

      const resGg = service.scanPhishing('https://discord.gg/cool-server');
      expect(resGg.isSuspicious).toBe(false);

      const resMedia = service.scanPhishing('https://cdn.discordapp.com/attachments/1/2/photo.png');
      expect(resMedia.isSuspicious).toBe(false);
    });

    it('should detect homoglyph phishing attempts', () => {
      // Cyrillic 'і'
      const fakeUrl = 'https://dіscord.com/nitro-gift';
      const res = service.scanPhishing(fakeUrl);
      expect(res.isSuspicious).toBe(true);
      expect(res.confidence).toBeGreaterThanOrEqual(0.9);
      expect(res.detectedTarget).toBe('discord.com');
    });

    it('should detect typosquatting domains', () => {
      const fakeUrl = 'https://discrod.com/free-gift';
      const res = service.scanPhishing(fakeUrl);
      expect(res.isSuspicious).toBe(true);
      expect(res.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('should detect suspicious brand + keyword combinations', () => {
      const fakeUrl = 'https://discord-nitro-claim.xyz/free';
      const res = service.scanPhishing(fakeUrl);
      expect(res.isSuspicious).toBe(true);
      expect(res.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('SimHash and Anti-Raid', () => {
    it('should compute simhash and calculate similarity', () => {
      const msg1 = 'Free nitro giveaway click here to claim now!';
      const msg2 = 'Free nitro giveaway click here to claim now!';
      const h1 = service.computeSimhash(msg1);
      const h2 = service.computeSimhash(msg2);

      expect(h1).toBeDefined();
      expect(h2).toBeDefined();
      const sim = service.calculateSimilarity(h1, h2);
      expect(sim).toBeCloseTo(1.0, 2);
    });

    it('should show lower similarity for unrelated text', () => {
      const msg1 = 'What is the server rules for music voice channels?';
      const msg2 = 'My favorite pizza topping is spicy pepperoni and mushrooms.';
      const h1 = service.computeSimhash(msg1);
      const h2 = service.computeSimhash(msg2);

      const sim = service.calculateSimilarity(h1, h2);
      expect(sim).toBeLessThan(0.7);
    });

    it('should detect coordinated raid messages', () => {
      const raidMessages = [
        'Massive free nitro drop click link 1',
        'Massive free nitro drop click link 2',
        'Massive free nitro drop click link 3',
        'Completely random chat from someone else',
        'Massive free nitro drop click link 4',
      ];

      const res = service.detectRaid(raidMessages, 0.85);
      expect(res.isRaidDetected).toBe(true);
      expect(res.largestClusterSize).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Secrets Scanning and DLP', () => {
    it('should detect and redact API keys', () => {
      const fakeKey = ['sk', 'proj', 'abcdef1234567890abcdef1234567890'].join('-');
      const input = `Please find key ${fakeKey} for debug`;
      const res = service.scanSecrets(input);

      expect(res.hasSecrets).toBe(true);
      expect(res.detections.length).toBeGreaterThan(0);
      expect(res.redactedText).toContain('[REDACTED:OPENAI_API_KEY]');
      expect(res.redactedText).not.toContain(fakeKey);
    });

    it('should detect and redact database connection URIs', () => {
      const fakePass = ['test', 'pass', '123'].join('');
      const dbUri = `postgres://myuser:${fakePass}@database-host:5432/mydb`;
      const input = `Config: ${dbUri} in production`;
      const res = service.scanSecrets(input);

      expect(res.hasSecrets).toBe(true);
      expect(res.redactedText).toContain('[REDACTED:DATABASE_CONNECTION_URI]');
      expect(res.redactedText).not.toContain(fakePass);
    });

    it('should not flag benign text', () => {
      const input = 'Hey everyone, please remember to join the game night at 8 PM!';
      const res = service.scanSecrets(input);

      expect(res.hasSecrets).toBe(false);
      expect(res.detections.length).toBe(0);
      expect(res.redactedText).toBe(input);
    });
  });

  describe('Inspect Message Integration', () => {
    it('should identify both phishing and secret leaks', () => {
      const fakeKey = ['sk', 'abcdef1234567890abcdef1234567890'].join('-');
      const content = `Check my token ${fakeKey}`;
      const urls = ['https://discrod.com/claim'];

      const inspection = service.inspectMessage(content, urls);
      expect(inspection.isThreat).toBe(true);
      expect(inspection.threatType).toBe('MULTIPLE');
      expect(inspection.phishingFindings.length).toBe(1);
      expect(inspection.secretFindings?.hasSecrets).toBe(true);
    });
  });
});
