import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_EMBED_TEMPLATES, EMBED_TEMPLATE_CATEGORY_META } from './embed-template-defaults';
import { EMBED_TEMPLATE_CATEGORIES, EmbedTemplateCategory, EmbedTemplatePayload } from './embed-template.types';

@Injectable()
export class EmbedTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async list(guildId: string) {
    const rows = await (this.prisma as any).embedTemplate.findMany({ where: { guildId } });
    const templates: Record<string, any> = {};
    for (const category of EMBED_TEMPLATE_CATEGORIES) {
      const saved = rows.find((row: any) => row.category === category);
      templates[category] = saved || {
        id: null,
        guildId,
        category,
        name: EMBED_TEMPLATE_CATEGORY_META[category].label,
        enabled: true,
        template: DEFAULT_EMBED_TEMPLATES[category],
        isDefault: true,
      };
    }
    return { categories: Object.values(EMBED_TEMPLATE_CATEGORY_META), templates };
  }

  async getTemplate(guildId: string, category: EmbedTemplateCategory) {
    this.assertCategory(category);
    const saved = await (this.prisma as any).embedTemplate.findUnique({
      where: { guildId_category: { guildId, category } },
    });
    if (saved?.enabled) return saved;
    return {
      guildId,
      category,
      name: EMBED_TEMPLATE_CATEGORY_META[category].label,
      enabled: true,
      template: DEFAULT_EMBED_TEMPLATES[category],
      isDefault: true,
    };
  }

  async save(guildId: string, category: EmbedTemplateCategory, template: EmbedTemplatePayload) {
    this.assertCategory(category);
    this.assertTemplate(template);
    return (this.prisma as any).embedTemplate.upsert({
      where: { guildId_category: { guildId, category } },
      update: { name: EMBED_TEMPLATE_CATEGORY_META[category].label, template: template as any, enabled: true },
      create: { guildId, category, name: EMBED_TEMPLATE_CATEGORY_META[category].label, template: template as any, enabled: true },
    });
  }

  async reset(guildId: string, category: EmbedTemplateCategory) {
    this.assertCategory(category);
    await (this.prisma as any).embedTemplate.deleteMany({ where: { guildId, category } });
    return this.getTemplate(guildId, category);
  }

  private assertCategory(category: string): asserts category is EmbedTemplateCategory {
    if (!EMBED_TEMPLATE_CATEGORIES.includes(category as EmbedTemplateCategory)) {
      throw new BadRequestException('Unknown embed template category.');
    }
  }

  private assertTemplate(template: EmbedTemplatePayload) {
    if (!template || !Array.isArray(template.embeds)) throw new BadRequestException('Template embeds array is required.');
    if (template.embeds.length > 10) throw new BadRequestException('Template can contain at most 10 embeds.');
  }
}
