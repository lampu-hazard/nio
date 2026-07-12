import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { GuildAccessGuard } from '../guilds/guards/guild-access.guard';
import { EmbedTemplateService } from './embed-template.service';
import { EmbedTemplateCategory, EmbedTemplatePayload } from './embed-template.types';

@UseGuards(SessionAuthGuard, GuildAccessGuard)
@Controller('guilds/:guildId/embed-templates')
export class EmbedTemplateController {
  constructor(private readonly templates: EmbedTemplateService) {}

  @Get()
  async list(@Param('guildId') guildId: string) {
    return { ok: true, ...(await this.templates.list(guildId)) };
  }

  @Put(':category')
  async save(
    @Param('guildId') guildId: string,
    @Param('category') category: EmbedTemplateCategory,
    @Body() body: { template: EmbedTemplatePayload },
  ) {
    const template = await this.templates.save(guildId, category, body.template);
    return { ok: true, template };
  }

  @Delete(':category')
  async reset(@Param('guildId') guildId: string, @Param('category') category: EmbedTemplateCategory) {
    const template = await this.templates.reset(guildId, category);
    return { ok: true, template };
  }
}
