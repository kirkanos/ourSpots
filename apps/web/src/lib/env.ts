/** Kartenquelle ist konfigurierbar, damit ein Wechsel keinen Code-Umbau kostet. */
export const TILE_URL =
  import.meta.env.VITE_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const TILE_ATTRIBUTION =
  import.meta.env.VITE_TILE_ATTRIBUTION ??
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende';

/** Deutschland-Mitte als Startausschnitt, wenn noch nichts anderes bekannt ist. */
export const DEFAULT_CENTER: [number, number] = [51.1, 10.4];
export const DEFAULT_ZOOM = 6;
