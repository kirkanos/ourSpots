import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TripRole } from '@ourspots/shared';

const RANK: Record<TripRole, number> = { viewer: 0, editor: 1, owner: 2 };

export function hasAtLeast(role: TripRole, required: TripRole): boolean {
  return RANK[role] >= RANK[required];
}

export function assertRole(role: TripRole | null, required: TripRole): TripRole {
  // Kein Zugriff und "nicht vorhanden" werden gleich behandelt: sonst verraet
  // die Fehlermeldung die Existenz fremder Reisen.
  if (role === null) throw new NotFoundException('Reise nicht gefunden');
  if (!hasAtLeast(role, required)) {
    throw new ForbiddenException('Dafür fehlen dir die Rechte in dieser Reise');
  }
  return role;
}
