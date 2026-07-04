import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { DiscordModule } from './discord/discord.module';
import { GuildsModule } from './guilds/guilds.module';
import { LoggerModule } from './logger/logger.module';
import { PanelsModule } from './panels/panels.module';
import { PrismaModule } from './prisma/prisma.module';
import { R2Module } from './r2/r2.module';
import { SelfRolesModule } from './self-roles/self-roles.module';
import { StickersModule } from './stickers/stickers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule,
    PrismaModule,
    R2Module,
    AuthModule,
    DiscordModule,
    GuildsModule,
    PanelsModule,
    SelfRolesModule,
    StickersModule,
  ],
})
export class AppModule {}
