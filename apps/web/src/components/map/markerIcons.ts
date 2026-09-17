import L from 'leaflet';
import type { SpotType } from '@womo/shared';

const COLORS: Record<SpotType, string> = {
  stellplatz: '#1f6f5c',
  campingplatz: '#2f6f9e',
  wildcamping: '#7a5c1f',
  parkplatz: '#5b5f66',
  sonstiges: '#6b4a7a',
};

/**
 * Marker als divIcon statt als Bilddatei: so entfällt das bekannte Problem mit
 * Leafletts Standard-Icon-Pfaden im Bundler, und die Farbe kann den Typ des
 * Stellplatzes ausdrücken.
 */
export function spotIcon(type: SpotType, rating: number | null): L.DivIcon {
  const color = COLORS[type] ?? COLORS.sonstiges;
  const label = rating ? `<text x="12" y="13.5" text-anchor="middle" font-size="9" font-weight="700" fill="${color}">${rating}</text>` : '';

  return L.divIcon({
    className: 'spot-marker',
    html: `<svg width="30" height="40" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 31c0 0 10-11.5 10-19A10 10 0 1 0 2 12c0 7.5 10 19 10 19Z" fill="${color}" stroke="#fff" stroke-width="1.6"/>
        <circle cx="12" cy="11" r="5" fill="#fff"/>${label}
      </svg>`,
    iconSize: [30, 40],
    iconAnchor: [15, 39],
    popupAnchor: [0, -34],
  });
}

/** Marker für die eigene Position bzw. einen frei gesetzten Punkt. */
export function crosshairIcon(): L.DivIcon {
  return L.divIcon({
    className: 'position-marker',
    html: `<svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">
        <circle cx="13" cy="13" r="8" fill="#2f6f9e" fill-opacity="0.25"/>
        <circle cx="13" cy="13" r="5" fill="#2f6f9e" stroke="#fff" stroke-width="2"/>
      </svg>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

export function waypointIcon(index: number, kind: string): L.DivIcon {
  const color = kind === 'start' ? '#2f9e7e' : kind === 'end' ? '#b3261e' : '#1f6f5c';
  return L.divIcon({
    className: 'waypoint-marker',
    html: `<svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">
        <circle cx="13" cy="13" r="11" fill="${color}" stroke="#fff" stroke-width="2"/>
        <text x="13" y="17" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">${index}</text>
      </svg>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}
