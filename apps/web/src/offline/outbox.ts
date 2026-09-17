import type { SpotDto, SpotInput } from '@womo/shared';
import { api, ApiError } from '../api/client';
import { db, type OutboxEntry } from './db';

type Listener = () => void;

const listeners = new Set<Listener>();
let snapshot: OutboxState = { pending: 0, failed: 0, syncing: false, lastError: null };

export interface OutboxState {
  pending: number;
  failed: number;
  syncing: boolean;
  lastError: string | null;
}

export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function outboxSnapshot(): OutboxState {
  return snapshot;
}

async function publish(patch: Partial<OutboxState> = {}): Promise<void> {
  const entries = await db.outbox.toArray();
  snapshot = {
    ...snapshot,
    ...patch,
    pending: entries.filter((entry) => !entry.failedReason).length,
    failed: entries.filter((entry) => entry.failedReason).length,
  };
  for (const listener of listeners) listener();
}

// --- Einreihen --------------------------------------------------------------

export async function queueSpot(id: string, input: SpotInput, optimistic: SpotDto): Promise<SpotDto> {
  await db.transaction('rw', db.outbox, db.pendingSpots, async () => {
    // Mehrfaches Bearbeiten desselben Platzes ergibt einen Eintrag, nicht viele.
    await db.outbox.put({
      id: `spot:${id}`,
      kind: 'spot',
      spotId: id,
      createdAt: Date.now(),
      attempts: 0,
      input,
    });
    await db.pendingSpots.put(optimistic);
  });
  await publish();
  return optimistic;
}

export async function queuePhoto(spotId: string, file: File): Promise<void> {
  const photoId = crypto.randomUUID();
  await db.transaction('rw', db.outbox, db.pendingPhotos, async () => {
    await db.pendingPhotos.put({ id: photoId, spotId, blob: file, filename: file.name });
    await db.outbox.put({
      id: `photo:${photoId}`,
      kind: 'photo',
      spotId,
      photoId,
      createdAt: Date.now(),
      attempts: 0,
    });
  });
  await publish();
}

export async function pendingSpots(): Promise<SpotDto[]> {
  return db.pendingSpots.toArray();
}

export async function pendingSpot(id: string): Promise<SpotDto | undefined> {
  return db.pendingSpots.get(id);
}

export async function discardFailed(): Promise<void> {
  const failed = await db.outbox.filter((entry) => Boolean(entry.failedReason)).toArray();
  await db.transaction('rw', db.outbox, db.pendingSpots, db.pendingPhotos, async () => {
    for (const entry of failed) {
      await db.outbox.delete(entry.id);
      if (entry.kind === 'spot') await db.pendingSpots.delete(entry.spotId);
      if (entry.photoId) await db.pendingPhotos.delete(entry.photoId);
    }
  });
  await publish({ lastError: null });
}

// --- Übertragen -------------------------------------------------------------

let running = false;

/**
 * Überträgt die Warteschlange der Reihe nach. Bei einem Netzwerkfehler wird
 * abgebrochen und später weitergemacht; eine inhaltliche Ablehnung des Servers
 * markiert nur diesen Eintrag, damit ein kaputter Datensatz nicht alles
 * Nachfolgende blockiert.
 */
export async function flushOutbox(): Promise<OutboxState> {
  if (running || !navigator.onLine) return snapshot;
  running = true;
  await publish({ syncing: true, lastError: null });

  try {
    const entries = (await db.outbox.orderBy('createdAt').toArray()).filter(
      (entry) => !entry.failedReason,
    );

    for (const entry of entries) {
      try {
        await send(entry);
        await db.transaction('rw', db.outbox, db.pendingSpots, db.pendingPhotos, async () => {
          await db.outbox.delete(entry.id);
          if (entry.kind === 'spot') await db.pendingSpots.delete(entry.spotId);
          if (entry.photoId) await db.pendingPhotos.delete(entry.photoId);
        });
      } catch (err) {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          await db.outbox.update(entry.id, {
            failedReason: err.message,
            attempts: entry.attempts + 1,
          });
          continue;
        }
        // Netz weg oder Server kaputt: später noch einmal versuchen.
        await db.outbox.update(entry.id, { attempts: entry.attempts + 1 });
        await publish({ syncing: false, lastError: err instanceof Error ? err.message : null });
        return snapshot;
      }
    }

    await publish({ syncing: false });
    return snapshot;
  } finally {
    running = false;
  }
}

async function send(entry: OutboxEntry): Promise<void> {
  if (entry.kind === 'spot') {
    if (!entry.input) return;
    await api(`/spots/${entry.spotId}`, { method: 'PUT', body: entry.input });
    return;
  }

  const photo = entry.photoId ? await db.pendingPhotos.get(entry.photoId) : undefined;
  if (!photo) return;

  const form = new FormData();
  form.append('file', photo.blob, photo.filename || 'foto.jpg');
  await api(`/spots/${photo.spotId}/photos`, { method: 'POST', body: form });
}

// --- Automatik --------------------------------------------------------------

export function startOutboxSync(): void {
  void publish();
  void flushOutbox();

  window.addEventListener('online', () => {
    void flushOutbox();
  });
  window.addEventListener('offline', () => {
    void publish({ lastError: null });
  });
}
