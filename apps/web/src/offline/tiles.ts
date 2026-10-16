import { TILE_URL } from '../lib/env';

export interface TileDownloadProgress {
  done: number;
  total: number;
}

/** Name des Kachel-Caches; muss zur Workbox-Konfiguration in vite.config.ts passen. */
const TILE_CACHE = 'karten-kacheln';

/**
 * Obergrenze je Vorgang.
 *
 * Nicht frei gewaehlt: Die Nutzungsbedingungen der OpenStreetMap-Kachelserver
 * nennen 250 Kacheln ab Zoomstufe 13 als Grenze, oberhalb derer sie von
 * massenhaftem Herunterladen sprechen. Die Zahl gilt hier fuer jede Quelle --
 * auch ein eigener Server soll nicht ueberfahren werden.
 */
const HOECHSTZAHL = 250;

/** Pause zwischen zwei Anfragen, damit daraus keine Welle wird. */
const PAUSE_MS = 120;

/**
 * Ob der sichtbare Ausschnitt ueberhaupt vorgeladen werden darf.
 *
 * Die OpenStreetMap-Foundation stellt ihre Kacheln zum Betrachten bereit, nicht
 * zum Befuellen fremder Caches; Vorabladen ist dort ausdruecklich untersagt.
 * Steht die Anwendung auf dieser Quelle, bleibt die Schaltflaeche deshalb aus,
 * statt die Regel mit kleineren Mengen zu umgehen. Mit einer eigenen oder
 * bezahlten Quelle in `VITE_TILE_URL` ist das Vorladen wieder frei.
 */
export function vorladenErlaubt(): boolean {
  try {
    const host = new URL(TILE_URL.replace('{s}', 'a'), window.location.href).hostname;
    return !/(^|\.)tile\.openstreetmap\.org$/i.test(host);
  } catch {
    return false;
  }
}

/**
 * Lädt die Kacheln eines Kartenausschnitts in den Cache, damit die Karte auch
 * ohne Netz etwas zeigt.
 *
 * Nacheinander und mit Pause statt in mehreren Straengen: Der Gewinn von vier
 * gleichzeitigen Anfragen sind wenige Sekunden, der Preis ist eine Anfragewelle
 * auf einem Server, der sie nicht bestellt hat. Bei 250 Kacheln dauert es so
 * rund eine halbe Minute -- lange genug, dass daneben ein Fortschritt steht,
 * und kurz genug, um darauf zu warten.
 */
export async function downloadTiles(
  bounds: { north: number; south: number; east: number; west: number },
  minZoom: number,
  maxZoom: number,
  limit: number,
  onProgress?: (progress: TileDownloadProgress) => void,
): Promise<TileDownloadProgress> {
  if (!vorladenErlaubt()) return { done: 0, total: 0 };

  const hoechstens = Math.min(limit, HOECHSTZAHL);
  const urls: string[] = [];

  for (let z = minZoom; z <= maxZoom && urls.length < hoechstens; z++) {
    const xMin = lonToTile(bounds.west, z);
    const xMax = lonToTile(bounds.east, z);
    const yMin = latToTile(bounds.north, z);
    const yMax = latToTile(bounds.south, z);

    for (let x = xMin; x <= xMax && urls.length < hoechstens; x++) {
      for (let y = yMin; y <= yMax && urls.length < hoechstens; y++) {
        urls.push(
          TILE_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)),
        );
      }
    }
  }

  const cache = await caches.open(TILE_CACHE);
  const total = urls.length;
  let done = 0;

  for (const url of urls) {
    try {
      const existing = await cache.match(url);
      if (!existing) {
        const response = await fetch(url, { mode: 'cors' });
        if (response.ok) await cache.put(url, response.clone());
        // Nur nach einer echten Anfrage warten: Was schon im Cache liegt,
        // belastet niemanden.
        await warte(PAUSE_MS);
      }
    } catch {
      // Einzelne Fehlschläge sind hinnehmbar – die Kachel fehlt dann eben.
    }
    done++;
    onProgress?.({ done, total });
  }

  return { done, total };
}

function warte(ms: number): Promise<void> {
  return new Promise((fertig) => setTimeout(fertig, ms));
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
