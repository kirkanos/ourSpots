/**
 * Geometrie des Reisewegs: eine durchgehende Punktkette aus den Teilrouten,
 * dazu die Rechnerei, die sowohl die Vorschau als auch ein spaeteres
 * serverseitiges Rendern braucht.
 *
 * Bewusst frei von React, DOM und Karten-Bibliothek: Diese Datei soll spaeter
 * unveraendert in einem Node-Renderer laufen koennen.
 */

export type Punkt = [number, number]; // [lon, lat] – wie GeoJSON, nicht wie Leaflet

/** Mittlerer Erdradius in Metern. */
const ERDRADIUS = 6_371_008.8;

/** Entfernung zweier Punkte in Metern (Haversine). */
export function entfernung(a: Punkt, b: Punkt): number {
  const bogen = Math.PI / 180;
  const dLat = (b[1] - a[1]) * bogen;
  const dLon = (b[0] - a[0]) * bogen;
  const lat1 = a[1] * bogen;
  const lat2 = b[1] * bogen;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * ERDRADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Kurs von a nach b in Grad, 0 = Norden. */
export function kurs(a: Punkt, b: Punkt): number {
  const bogen = Math.PI / 180;
  const lat1 = a[1] * bogen;
  const lat2 = b[1] * bogen;
  const dLon = (b[0] - a[0]) * bogen;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Vorbereiteter Track: Punkte plus aufsummierte Entfernungen. Damit laesst
 * sich zu jedem Streckenanteil in einem Schritt der Ort bestimmen, ohne die
 * Kette jedes Mal neu durchzurechnen.
 */
export interface Track {
  punkte: Punkt[];
  /** summe[i] = Strecke vom Anfang bis Punkt i, in Metern. */
  summe: number[];
  laengeM: number;
}

export function baueTrack(punkte: Punkt[]): Track {
  const summe = [0];
  for (let i = 1; i < punkte.length; i++) {
    summe.push(summe[i - 1]! + entfernung(punkte[i - 1]!, punkte[i]!));
  }
  return { punkte, summe, laengeM: summe[summe.length - 1] ?? 0 };
}

/** Ort auf dem Track bei einem Streckenanteil in 0..1, linear zwischen zwei Punkten. */
export function ortBei(track: Track, anteil: number): Punkt {
  const { punkte, summe, laengeM } = track;
  if (punkte.length === 0) return [0, 0];
  if (punkte.length === 1 || laengeM === 0) return punkte[0]!;

  const ziel = Math.min(Math.max(anteil, 0), 1) * laengeM;
  const i = suchIndex(summe, ziel);
  const a = punkte[i]!;
  const b = punkte[i + 1] ?? a;
  const abschnitt = (summe[i + 1] ?? summe[i]!) - summe[i]!;
  const t = abschnitt > 0 ? (ziel - summe[i]!) / abschnitt : 0;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Kurs an einer Stelle des Tracks, ueber ein Stueck Strecke gemittelt.
 *
 * Das Fenster ist bewusst gross: Einzelne Kurven und Autobahnkreuze sollen die
 * Blickrichtung nicht aendern, nur der grobe Verlauf der Etappe.
 */
export function kursBei(track: Track, anteil: number, fensterM = 6000): number {
  const vor = ortBei(track, anteil);
  const nach = ortBei(track, Math.min(1, anteil + fensterM / Math.max(1, track.laengeM)));
  if (vor[0] === nach[0] && vor[1] === nach[1]) return 0;
  return kurs(vor, nach);
}

/** Die Punkte bis zu einem Streckenanteil – das ist die bereits gefahrene Linie. */
export function linieBis(track: Track, anteil: number): Punkt[] {
  const { punkte, summe, laengeM } = track;
  if (punkte.length < 2 || laengeM === 0) return punkte.slice();

  const ziel = Math.min(Math.max(anteil, 0), 1) * laengeM;
  const i = suchIndex(summe, ziel);
  return [...punkte.slice(0, i + 1), ortBei(track, anteil)];
}

/** Umschliessendes Rechteck als [west, sued, ost, nord]. */
export function huelle(punkte: Punkt[]): [number, number, number, number] {
  let west = 180;
  let sued = 90;
  let ost = -180;
  let nord = -90;
  for (const [lon, lat] of punkte) {
    if (lon < west) west = lon;
    if (lon > ost) ost = lon;
    if (lat < sued) sued = lat;
    if (lat > nord) nord = lat;
  }
  return [west, sued, ost, nord];
}

/** Groesster Index mit summe[i] <= ziel, binaer gesucht. */
function suchIndex(summe: number[], ziel: number): number {
  let lo = 0;
  let hi = summe.length - 1;
  while (lo < hi) {
    const mitte = Math.ceil((lo + hi) / 2);
    if (summe[mitte]! <= ziel) lo = mitte;
    else hi = mitte - 1;
  }
  return Math.min(lo, summe.length - 2);
}
