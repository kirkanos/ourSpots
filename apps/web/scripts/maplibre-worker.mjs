/**
 * Legt den MapLibre-Worker als statisches Asset unter public/ ab.
 *
 * MapLibre erledigt im Worker alles, was Geometrie verarbeitet: Vektorkacheln
 * ebenso wie GeoJSON-Quellen. Faellt er aus, rendert nur noch, was der
 * Hauptthread allein kann -- Rasterkacheln. Vektordaten und eigene Linien
 * fehlen dann, und zwar ohne sichtbaren Fehler in der Karte.
 *
 * Der Worker wird aus einer Blob-URL gestartet, die das Worker-Modul per URL
 * nachlaedt. Laeuft diese URL durch Vites Modulpipeline, spritzt Vite im
 * Entwicklungsbetrieb seinen HMR-Client hinein -- der greift auf document zu,
 * das es im Worker nicht gibt. Aus public/ liefert Vite die Datei dagegen
 * unveraendert aus, im Entwicklungsbetrieb wie im Build.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const hier = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const quelle = resolve(
  dirname(require.resolve('maplibre-gl/package.json')),
  'dist/maplibre-gl-worker.mjs',
);
const ziel = resolve(hier, '../public/maplibre-gl-worker.mjs');

await mkdir(dirname(ziel), { recursive: true });
await copyFile(quelle, ziel);
console.log(`MapLibre-Worker kopiert: ${ziel}`);
