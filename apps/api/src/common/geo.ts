const EARTH_RADIUS_KM = 6371;

export interface BoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export function parseBbox(value: string): BoundingBox | null {
  const parts = value.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [minLon, minLat, maxLon, maxLat] = parts as [number, number, number, number];
  return { minLon, minLat, maxLon, maxLat };
}

export function parseLatLon(value: string): { lat: number; lon: number } | null {
  const parts = value.split(',').map(Number);
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return null;
  const [lat, lon] = parts as [number, number];
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

export function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Grobes Rechteck um einen Punkt. Es dient nur dazu, die Kandidatenmenge per
 * Index einzugrenzen – die genaue Entfernung rechnet danach die Haversine-
 * Formel.
 */
export function boundingBoxAround(lat: number, lon: number, radiusKm: number): BoundingBox {
  const latDelta = radiusKm / 111.32;
  const cos = Math.cos(toRad(lat));
  // Nahe den Polen laeuft der Laengengrad-Abstand gegen null; ohne Untergrenze
  // wuerde das Rechteck dort ins Unendliche wachsen.
  const lonDelta = radiusKm / (111.32 * Math.max(0.01, Math.abs(cos)));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLon: lon - lonDelta,
    maxLon: lon + lonDelta,
  };
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
