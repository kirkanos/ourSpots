/**
 * Encoded Polyline (Google-Format, Präzision 5) – so liefert OpenRouteService
 * seine Geometrien.
 *
 * Bewusst selbst implementiert statt als Abhängigkeit: es sind dreißig Zeilen,
 * und Backend (GPX-Export) wie Frontend (Kartenlinie) brauchen dieselbe
 * Funktion.
 */

export type LatLon = [number, number];

export function decodePolyline(encoded: string, precision = 5): LatLon[] {
  const factor = 10 ** precision;
  const points: LatLon[] = [];

  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    lat += decodeValue();
    lon += decodeValue();
    points.push([lat / factor, lon / factor]);
  }

  return points;

  function decodeValue(): number {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    // Das unterste Bit markiert ein negatives Delta.
    return result & 1 ? ~(result >> 1) : result >> 1;
  }
}

/** Umschließendes Rechteck als [minLon, minLat, maxLon, maxLat]. */
export function boundsOf(points: LatLon[]): [number, number, number, number] | null {
  if (points.length === 0) return null;

  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;

  for (const [lat, lon] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }

  return [minLon, minLat, maxLon, maxLat];
}
