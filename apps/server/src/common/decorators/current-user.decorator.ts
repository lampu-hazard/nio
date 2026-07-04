import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type SessionUser = {
  id: string;
  username: string;
  globalName?: string | null;
  avatar?: string | null;
};

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): SessionUser | undefined => {
  const request = ctx.switchToHttp().getRequest();
  return request.session?.user;
});
