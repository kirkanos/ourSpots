import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '../generated/prisma/client';

/**
 * Laesst nur globale Administratoren durch.
 *
 * Bewusst ein eigener Guard und keine Pruefung in jeder Methode: So kann eine
 * neu hinzugefuegte Verwaltungsroute die Pruefung nicht vergessen -- sie haengt
 * am Controller, nicht am Einzelfall.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: User }>();
    if (request.user?.role !== 'admin') {
      throw new ForbiddenException('Dafür brauchst du Administratorrechte');
    }
    return true;
  }
}
