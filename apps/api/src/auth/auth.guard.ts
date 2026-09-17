import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, SESSION_COOKIE } from './auth.constants';
import { SessionService } from './session.service';
import type { AuthenticatedRequest } from './current-user.decorator';

/**
 * Global registriert: jede Route ist standardmaessig geschuetzt. Ausnahmen
 * werden mit @Public() ausdruecklich markiert – so kann eine neue Route nicht
 * versehentlich offen sein.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const sessionId = request.signedCookies?.[SESSION_COOKIE];
    if (typeof sessionId !== 'string' || !sessionId) {
      throw new UnauthorizedException('Nicht angemeldet');
    }

    const session = await this.sessions.resolve(sessionId);
    if (!session) {
      throw new UnauthorizedException('Sitzung abgelaufen');
    }

    request.user = session.user;
    request.sessionId = session.id;
    return true;
  }
}
