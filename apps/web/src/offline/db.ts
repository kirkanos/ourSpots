import Dexie, { type Table } from 'dexie';
import type { SpotDto, SpotInput } from '@ourspots/shared';

/**
 * Lokaler Zwischenspeicher für die Offline-Erfassung.
 *
 * Grundgedanke: Änderungen wandern zuerst in die Outbox und werden von dort
 * unverändert nachgesendet, sobald wieder Netz da ist. Weil jede ID schon im
 * Client entsteht und alle Schreibzugriffe PUT sind, schadet ein doppelt
 * zugestellter Eintrag nicht.
 */

export interface OutboxEntry {
  id: string;
  kind: 'spot' | 'photo';
  /** Stellplatz, zu dem der Eintrag gehört – für Anzeige und Aufräumen. */
  spotId: string;
  createdAt: number;
  attempts: number;
  /** Gesetzt, wenn der Server den Eintrag endgültig abgelehnt hat. */
  failedReason?: string;
  input?: SpotInput;
  photoId?: string;
}

export interface PendingPhoto {
  id: string;
  spotId: string;
  blob: Blob;
  filename: string;
}

class OurSpotsDatabase extends Dexie {
  outbox!: Table<OutboxEntry, string>;
  /** Vollständige Stellplätze, solange sie noch nicht übertragen sind. */
  pendingSpots!: Table<SpotDto, string>;
  pendingPhotos!: Table<PendingPhoto, string>;

  constructor() {
    super('ourspots');
    this.version(1).stores({
      outbox: 'id, createdAt, spotId, kind',
      pendingSpots: 'id, updatedAt',
      pendingPhotos: 'id, spotId',
    });
  }
}

export const db = new OurSpotsDatabase();

/** Ein Netzwerkfehler – im Gegensatz zu einer Absage des Servers. */
export function isOfflineError(error: unknown): boolean {
  if (!navigator.onLine) return true;
  // fetch wirft bei fehlender Verbindung einen TypeError ohne Statuscode.
  return error instanceof TypeError;
}
