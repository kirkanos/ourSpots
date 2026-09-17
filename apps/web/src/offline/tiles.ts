import { TILE_URL } from '../lib/env';

export interface TileDownloadProgress {
  done: number;
  total: number;
}

/** Name des Kachel-Caches; muss zur Workbox-Konfiguration in vite.config.ts passen. */
const TILE_CACHE = 'karten-kacheln';

/**
 * Lädt die Kacheln eines Kartenausschnitts in den Cache, damit die Karte auch
 * ohne Netz etwas zeigt. Bewusst mit Obergrenze: ein weiter Ausschnitt über
 * mehrere Zoomstufen wären schnell Zehntausende Dateien.
 */
export async function downloadTiles(
  bounds: { north: number; south: number; east: number; west: number },
  minZoom: number,
  maxZoom: number,
  limit: number,
  onProgress?: (progress: TileDownloadProgress) => void,
): Promise<TileDownloadProgress> {
  const urls: string[] = [];

  for (let z = minZoom; z <= maxZoom && urls.length < limit; z++) {
    const xMin = lonToTile(bounds.west, z);
    const xMax = lonToTile(bounds.east, z);
    const yMin = latToTile(bounds.north, z);
    const yMax = latToTile(bounds.south, z);

    for (let x = xMin; x <= xMax && urls.length < limit; x++) {
      for (let y = yMin; y <= yMax && urls.length < limit; y++) {
        urls.push(
          TILE_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)),
        );
      }
    }
  }

  const cache = await caches.open(TILE_CACHE);
  let done = 0;

  // Kleine Parallelität: die Kachelserver mögen keine Anfragewellen, und die
  // Nutzungsbedingungen von OpenStreetMap verbieten massenhaftes Vorabladen.
  const workers = Array.from({ length: 4 }, async () => {
    for (;;) {
      const url = urls.pop();
      if (!url) return;
      try {
        const existing = await cache.match(url);
        if (!existing) {
          const response = await fetch(url, { mode: 'cors' });
          if (response.ok) await cache.put(url, response.clone());
        }
      } catch {
        // Einzelne Fehlschläge sind hinnehmbar – die Kachel fehlt dann eben.
      }
      done++;
      onProgress?.({ done, total: urls.length + done });
    }
  });

  const total = urls.length;
  await Promise.all(workers);
  return { done, total };
}

export async function tileCacheSize(): Promise<number> {
  if (!('caches' in window)) return 0;
  const cache = await caches.open(TILE_CACHE);
  return (await cache.keys()).length;
}

export async function clearTileCache(): Promise<void> {
  await caches.delete(TILE_CACHE);
}

function lonToTile(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}

function latToTile(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom);
}
