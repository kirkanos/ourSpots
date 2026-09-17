import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '@prisma/client';

export interface AuthenticatedRequest extends Request {
  user?: User;
  sessionId?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      // Sollte der Guard verhindern; als Programmierfehler laut scheitern.
      throw new Error('CurrentUser auf einer Route ohne AuthGuard verwendet');
    }
    return request.user;
  },
);
