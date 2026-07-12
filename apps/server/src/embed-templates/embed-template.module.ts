import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmbedTemplateController } from './embed-template.controller';
import { EmbedTemplateRendererService } from './embed-template-renderer.service';
import { EmbedTemplateService } from './embed-template.service';

@Module({
  imports: [PrismaModule],
  controllers: [EmbedTemplateController],
  providers: [EmbedTemplateService, EmbedTemplateRendererService],
  exports: [EmbedTemplateService, EmbedTemplateRendererService],
})
export class EmbedTemplateModule {}
