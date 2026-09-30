import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class OwnerAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const ownerId = process.env.OWNER_DISCORD_ID?.trim();
    const request = context.switchToHttp().getRequest<Request>();
    if (!ownerId || request.session?.user?.id !== ownerId) {
      throw new ForbiddenException('Owner access required.');
    }
    return true;
  }
}
