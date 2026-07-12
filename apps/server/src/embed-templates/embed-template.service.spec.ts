import { describe, expect, it, jest } from '@jest/globals';
import { EmbedTemplateService } from './embed-template.service';

describe('EmbedTemplateService', () => {
  it('returns defaults and saved template categories', async () => {
    const prisma = {
      embedTemplate: {
        findMany: jest.fn(async () => [{
          id: 'tpl-1',
          guildId: 'guild-1',
          category: 'TAKO_PUBLIC_ANNOUNCEMENT',
          name: 'Tako Public Announcement',
          enabled: true,
          template: { content: '', embeds: [{ description: 'custom' }] },
        }]),
      },
    };
    const service = new EmbedTemplateService(prisma as any);
    const result = await service.list('guild-1');
    expect(result.categories.some((c) => c.category === 'TAKO_PUBLIC_ANNOUNCEMENT')).toBe(true);
    expect(result.templates.TAKO_PUBLIC_ANNOUNCEMENT.template.embeds[0].description).toBe('custom');
  });

  it('upserts one template per guild/category', async () => {
    const prisma = {
      embedTemplate: {
        upsert: jest.fn(async (args: any) => ({ id: 'tpl-1', ...args.create })),
      },
    };
    const service = new EmbedTemplateService(prisma as any);
    await service.save('guild-1', 'TAKO_PUBLIC_ANNOUNCEMENT', {
      content: '',
      embeds: [{ description: '{user.mention} baru saja memberikan Rp{donation.amount}!' }],
    });
    expect(prisma.embedTemplate.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { guildId_category: { guildId: 'guild-1', category: 'TAKO_PUBLIC_ANNOUNCEMENT' } },
    }));
  });
});
