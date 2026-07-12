import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmbedTemplateModule } from '../embed-templates/embed-template.module';
import { TakoController } from './tako.controller';
import { TakoService } from './tako.service';

@Module({
  imports: [PrismaModule, EmbedTemplateModule],
  controllers: [TakoController],
  providers: [TakoService],
  exports: [TakoService],
})
export class TakoModule {}
