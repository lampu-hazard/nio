import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { StickersService } from './stickers.service';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../r2/r2.service';
import { AppLogger } from '../logger/logger.service';
import { AppError } from '../common/errors/app-error';

describe('StickersService', () => {
  let service: StickersService;
  let prisma: any;
  let r2: any;
  let logger: any;

  beforeEach(() => {
    prisma = {
      sticker: {
        findMany: jest.fn().mockImplementation(async () => []),
        create: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
      guildSettings: {
        findMany: jest.fn().mockImplementation(async () => []),
        upsert: jest.fn(),
      },
    };

    r2 = {
      getPresignedUploadUrl: jest.fn(),
      headObject: jest.fn(),
      deleteObject: jest.fn().mockImplementation(async () => {}),
      getPublicUrl: jest.fn((key: string) => `https://cdn.test/${key}`),
    };

    logger = {
      log: jest.fn(),
      error: jest.fn(),
    };

    service = new StickersService(
      prisma as unknown as PrismaService,
      r2 as unknown as R2Service,
      logger as unknown as AppLogger,
    );
  });

  describe('getUploadUrl', () => {
    it('generates a valid presigned upload URL and key', async () => {
      r2.getPresignedUploadUrl.mockImplementation(async () => 'https://presigned.url');

      const result = await service.getUploadUrl('guild-123', {
        fileName: 'sticker.png',
        contentType: 'image/png',
      });

      expect(result.uploadUrl).toBe('https://presigned.url');
      expect(result.key).toMatch(/^stickers\/guild-123\/[a-f0-9-]+\.png$/);
      expect(r2.getPresignedUploadUrl).toHaveBeenCalledWith(
        result.key,
        'image/png',
        2 * 1024 * 1024,
      );
    });
  });

  describe('create', () => {
    it('throws error if file is not uploaded to R2', async () => {
      r2.headObject.mockImplementation(async () => false);

      await expect(
        service.create('guild-123', {
          name: 'malas',
          key: 'stickers/guild-123/xyz.png',
          type: 'image/png',
        }),
      ).rejects.toThrow(
        new AppError('FILE_NOT_UPLOADED', 'File not uploaded to storage', 400),
      );

      expect(r2.headObject).toHaveBeenCalledWith('stickers/guild-123/xyz.png');
      expect(prisma.sticker.create).not.toHaveBeenCalled();
    });

    it('creates sticker metadata in DB if file exists in R2', async () => {
      r2.headObject.mockImplementation(async () => true);
      const mockSticker = {
        id: 'sticker-1',
        guildId: 'guild-123',
        name: 'malas',
        url: 'https://cdn.test/stickers/guild-123/xyz.png',
        type: 'image/png',
        createdAt: new Date(),
      };
      prisma.sticker.create.mockImplementation(async () => mockSticker);

      const result = await service.create('guild-123', {
        name: 'malas',
        key: 'stickers/guild-123/xyz.png',
        type: 'image/png',
      });

      expect(result).toEqual(mockSticker);
      expect(prisma.sticker.create).toHaveBeenCalledWith({
        data: {
          guildId: 'guild-123',
          name: 'malas',
          url: 'https://cdn.test/stickers/guild-123/xyz.png',
          type: 'image/png',
        },
      });
    });

    it('throws 409 Conflict if sticker name already exists in guild', async () => {
      r2.headObject.mockImplementation(async () => true);
      const dbError = new Error('Prisma error') as any;
      dbError.code = 'P2002'; // Unique constraint violation code
      prisma.sticker.create.mockImplementation(async () => {
        throw dbError;
      });

      await expect(
        service.create('guild-123', {
          name: 'malas',
          key: 'stickers/guild-123/xyz.png',
          type: 'image/png',
        }),
      ).rejects.toThrow(
        new AppError('STICKER_NAME_EXISTS', 'Sticker "malas" already exists in this guild', 409),
      );
    });
  });

  describe('delete', () => {
    it('deletes sticker from DB and triggers best-effort R2 deletion', async () => {
      const mockSticker = {
        id: 'sticker-1',
        guildId: 'guild-123',
        name: 'malas',
        url: 'https://cdn.test/stickers/guild-123/xyz.png',
        type: 'image/png',
        createdAt: new Date(),
      };
      prisma.sticker.findFirst.mockImplementation(async () => mockSticker);
      prisma.sticker.delete.mockImplementation(async () => mockSticker);

      const result = await service.delete('guild-123', 'sticker-1');

      expect(result).toEqual(mockSticker);
      expect(prisma.sticker.delete).toHaveBeenCalledWith({ where: { id: 'sticker-1' } });
      expect(r2.deleteObject).toHaveBeenCalledWith('stickers/guild-123/xyz.png');
    });

    it('throws 404 if sticker is not found in the guild', async () => {
      prisma.sticker.findFirst.mockImplementation(async () => null);

      await expect(
        service.delete('guild-123', 'sticker-invalid'),
      ).rejects.toThrow(
        new AppError('STICKER_NOT_FOUND', 'Sticker not found', 404),
      );

      expect(prisma.sticker.delete).not.toHaveBeenCalled();
    });
  });
});
