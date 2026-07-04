import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    console.log('[DEBUG AUTH GUARD]', {
      url: request.url,
      method: request.method,
      hasCookieHeader: !!request.headers.cookie,
      cookieHeaderValueSnippet: request.headers.cookie ? request.headers.cookie.substring(0, 30) : 'none',
      hasSession: !!request.session,
      sessionID: request.sessionID,
      hasUser: !!request.session?.user,
      headers: {
        host: request.headers.host,
        xForwardedProto: request.headers['x-forwarded-proto'],
        xForwardedFor: request.headers['x-forwarded-for'],
      }
    });

    if (!request.session?.user) {
      throw new AppError('AUTH_REQUIRED', 'Login required', 401);
    }
    return true;
  }
}
