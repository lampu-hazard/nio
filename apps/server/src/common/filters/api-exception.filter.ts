import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { Response } from 'express';
import { AppError } from '../errors/app-error';
import { AppLogger } from '../../logger/logger.service';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(@Inject(AppLogger) private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest();
    const response = ctx.getResponse<Response>();
    const url = `${request.method} ${request.url}`;

    if (exception instanceof AppError) {
      this.logger.warn(`${exception.code}: ${exception.message} [${url}]`, 'ExceptionFilter');
      return response.status(exception.status).json({ ok: false, code: exception.code, message: exception.message, details: exception.details });
    }

    if (exception instanceof HttpException) {
      const details = exception.getResponse();
      const detailMessage = typeof details === 'object' && details !== null && 'message' in details
        ? (details as { message?: string | string[] }).message
        : undefined;
      const message = Array.isArray(detailMessage) ? detailMessage.join('; ') : detailMessage || exception.message;
      this.logger.warn(`HTTP ${exception.getStatus()}: ${message} [${url}]`, 'ExceptionFilter');
      return response.status(exception.getStatus()).json({ ok: false, code: 'HTTP_ERROR', message, details });
    }

    const err = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(`Unhandled: ${err.message}`, err.stack, 'ExceptionFilter');
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ ok: false, code: 'INTERNAL_ERROR', message: 'Internal server error', details: {} });
  }
}
