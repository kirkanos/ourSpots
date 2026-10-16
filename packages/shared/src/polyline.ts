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

/**
 * Dasselbe mit Höhe: OpenRouteService hängt eine dritte Zahl je Punkt an,
 * sobald man `elevation: true` anfordert.
 *
 * Die Höhe kommt mit Präzision 2, die Koordinaten weiterhin mit 5 – deshalb
 * zwei Faktoren.
 */
export type LatLonEle = [number, number, number];

export function decodePolyline3(encoded: string, precision = 5, elePrecision = 2): LatLonEle[] {
  const factor = 10 ** precision;
  const eleFactor = 10 ** elePrecision;
  const points: LatLonEle[] = [];

  let index = 0;
  let lat = 0;
  let lon = 0;
  let ele = 0;

  while (index < encoded.length) {
    lat += decodeValue();
    lon += decodeValue();
    ele += decodeValue();
    points.push([lat / factor, lon / factor, ele / eleFactor]);
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
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  }
}

/**
 * Zurück in die zweidimensionale Form.
 *
 * Gebraucht, weil die Höhe nur für die Bilanz interessant ist: Gespeichert
 * wird die Geometrie weiter flach, damit Karte, GPX-Export und Reisevideo
 * unverändert damit arbeiten. Auf- und Abstieg liegen als eigene Zahlen
 * daneben.
 */
export function encodePolyline(points: LatLon[], precision = 5): string {
  const factor = 10 ** precision;
  let vorherLat = 0;
  let vorherLon = 0;
  let aus = '';

  for (const [lat, lon] of points) {
    const ganzLat = Math.round(lat * factor);
    const ganzLon = Math.round(lon * factor);
    aus += kodiere(ganzLat - vorherLat) + kodiere(ganzLon - vorherLon);
    vorherLat = ganzLat;
    vorherLon = ganzLon;
  }
  return aus;

  function kodiere(wert: number): string {
    let v = wert < 0 ? ~(wert << 1) : wert << 1;
    let s = '';
    while (v >= 0x20) {
      s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    s += String.fromCharCode(v + 63);
    return s;
  }
}
