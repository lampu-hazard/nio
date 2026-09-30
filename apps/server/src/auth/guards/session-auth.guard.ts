import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();


    if (!request.session?.user) {
      throw new AppError('AUTH_REQUIRED', 'Login required', 401);
    }
    return true;
  }
}
