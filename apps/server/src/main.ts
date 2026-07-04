import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { PrismaSessionStore } from '@quixo3/prisma-session-store';
import { AppModule } from './app.module';
import { createSessionOptions } from './auth/session-options';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { AppLogger } from './logger/logger.service';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(AppLogger);
  app.useLogger(logger);

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  app.use(cookieParser());
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  const prisma = app.get(PrismaService);
  app.use(
    session({
      ...createSessionOptions(),
      store: new PrismaSessionStore(prisma, {
        checkPeriod: 2 * 60 * 1000, // 2 minutes
        dbRecordIdFunction: undefined,
        dbRecordIdIsSessionId: true,
      }),
    }),
  );

  app.useGlobalFilters(new ApiExceptionFilter(logger));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = Number(process.env.PORT || 3001);
  await app.listen(port);
  logger.log(`nio backend listening on port ${port}`, 'Bootstrap');
}

bootstrap();
