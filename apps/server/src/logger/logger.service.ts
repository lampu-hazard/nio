import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import * as winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const nioFormat = printf(({ level, message, timestamp, context, stack, ...meta }: any) => {
  const ctx = context ? `[${context}]` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const trace = stack ? `\n${stack}` : '';
  return `${timestamp} ${level} ${ctx} ${message}${metaStr}${trace}`;
});

@Injectable()
export class AppLogger implements NestLoggerService {
  private readonly logger: winston.Logger;

  constructor() {
    const isProduction = process.env.NODE_ENV === 'production';

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
      format: combine(
        errors({ stack: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      ),
      defaultMeta: { service: 'nio' },
      transports: [
        new winston.transports.Console({
          format: combine(
            colorize({ all: !isProduction }),
            nioFormat,
          ),
        }),
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          maxsize: 5 * 1024 * 1024,
          maxFiles: 5,
          format: combine(nioFormat),
        }),
        new winston.transports.File({
          filename: 'logs/combined.log',
          maxsize: 10 * 1024 * 1024,
          maxFiles: 5,
          format: combine(nioFormat),
        }),
      ],
    });
  }

  log(message: string, context?: string) {
    this.logger.info(message, { context });
  }

  error(message: string, trace?: string, context?: string) {
    this.logger.error(message, { context, stack: trace });
  }

  warn(message: string, context?: string) {
    this.logger.warn(message, { context });
  }

  debug(message: string, context?: string) {
    this.logger.debug(message, { context });
  }

  verbose(message: string, context?: string) {
    this.logger.verbose(message, { context });
  }

  /** Direct access to winston logger for advanced usage */
  getWinston(): winston.Logger {
    return this.logger;
  }
}
