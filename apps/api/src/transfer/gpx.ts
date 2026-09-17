import { decodePolyline, type LatLon } from '@ourspots/shared';

/**
 * GPX- und KML-Erzeugung von Hand.
 *
 * Beide Formate sind hier auf wenige Elemente beschränkt – Wegpunkte, Track und
 * Stellplätze. Eine Bibliothek dafür einzubinden würde mehr Abhängigkeit als
 * Nutzen bringen.
 */

export interface ExportPoint {
  name: string;
  lat: number;
  lon: number;
  description?: string | null;
  time?: string | null;
}

export interface ExportTrack {
  name: string;
  /** Encoded Polylines der Teilrouten, in Fahrtreihenfolge. */
  geometries: string[];
}

export function buildGpx(
  title: string,
  waypoints: ExportPoint[],
  spots: ExportPoint[],
  track: ExportTrack | null,
): string {
  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="OurSpots" xmlns="http://www.topografix.com/GPX/1/1">',
    '  <metadata>',
    `    <name>${escapeXml(title)}</name>`,
    `    <time>${new Date().toISOString()}</time>`,
    '  </metadata>',
  ];

  for (const point of [...waypoints, ...spots]) {
    parts.push(`  <wpt lat="${point.lat}" lon="${point.lon}">`);
    parts.push(`    <name>${escapeXml(point.name)}</name>`);
    if (point.description) parts.push(`    <desc>${escapeXml(point.description)}</desc>`);
    if (point.time) parts.push(`    <time>${point.time}</time>`);
    parts.push('  </wpt>');
  }

  if (track && track.geometries.length > 0) {
    parts.push('  <trk>');
    parts.push(`    <name>${escapeXml(track.name)}</name>`);
    for (const geometry of track.geometries) {
      parts.push('    <trkseg>');
      for (const [lat, lon] of decodePolyline(geometry)) {
        parts.push(`      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}" />`);
      }
      parts.push('    </trkseg>');
    }
    parts.push('  </trk>');
  }

  parts.push('</gpx>');
  return parts.join('\n');
}

export function buildKml(
  title: string,
  waypoints: ExportPoint[],
  spots: ExportPoint[],
  track: ExportTrack | null,
): string {
  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    '  <Document>',
    `    <name>${escapeXml(title)}</name>`,
  ];

  const placemark = (point: ExportPoint, folder: string) => {
    parts.push('    <Placemark>');
    parts.push(`      <name>${escapeXml(point.name)}</name>`);
    if (point.description) {
      parts.push(`      <description>${escapeXml(point.description)}</description>`);
    }
    parts.push(`      <ExtendedData><Data name="art"><value>${folder}</value></Data></ExtendedData>`);
    parts.push(`      <Point><coordinates>${point.lon},${point.lat},0</coordinates></Point>`);
    parts.push('    </Placemark>');
  };

  for (const point of waypoints) placemark(point, 'Zwischenziel');
  for (const point of spots) placemark(point, 'Stellplatz');

  if (track && track.geometries.length > 0) {
    const points: LatLon[] = track.geometries.flatMap((geometry) => decodePolyline(geometry));
    parts.push('    <Placemark>');
    parts.push(`      <name>${escapeXml(track.name)}</name>`);
    parts.push('      <LineString><tessellate>1</tessellate><coordinates>');
    parts.push(
      points.map(([lat, lon]) => `${lon.toFixed(6)},${lat.toFixed(6)},0`).join(' '),
    );
    parts.push('      </coordinates></LineString>');
    parts.push('    </Placemark>');
  }

  parts.push('  </Document>', '</kml>');
  return parts.join('\n');
}

/** Wegpunkte aus GPX oder KML lesen – ohne XML-Parser, mit Regexen. */
export function parsePoints(content: string): ExportPoint[] {
  const points: ExportPoint[] = [];

  // GPX: <wpt lat=".." lon=".."> … <name>..</name>
  const wptPattern = /<wpt[^>]*\blat="([^"]+)"[^>]*\blon="([^"]+)"[^>]*>([\s\S]*?)<\/wpt>/gi;
  for (const match of content.matchAll(wptPattern)) {
    const lat = Number(match[1]);
    const lon = Number(match[2]);
    const body = match[3] ?? '';
    if (!isValidCoordinate(lat, lon)) continue;
    points.push({
      lat,
      lon,
      name: tagValue(body, 'name') ?? 'Importierter Punkt',
      description: tagValue(body, 'desc') ?? tagValue(body, 'cmt'),
      time: tagValue(body, 'time'),
    });
  }

  // KML: <Placemark> … <coordinates>lon,lat[,höhe]</coordinates>
  const placemarkPattern = /<Placemark[^>]*>([\s\S]*?)<\/Placemark>/gi;
  for (const match of content.matchAll(placemarkPattern)) {
    const body = match[1] ?? '';
    const coords = /<coordinates>\s*([-\d.]+)\s*,\s*([-\d.]+)/i.exec(body);
    if (!coords) continue;
    const lon = Number(coords[1]);
    const lat = Number(coords[2]);
    if (!isValidCoordinate(lat, lon)) continue;
    points.push({
      lat,
      lon,
      name: tagValue(body, 'name') ?? 'Importierter Punkt',
      description: tagValue(body, 'description'),
      time: null,
    });
  }

  return points;
}

/**
 * CSV mit Kopfzeile. Erkannt werden die üblichen Spaltennamen aus Excel-Listen
 * und Exporten anderer Apps, deutsch wie englisch.
 */
export function parseCsv(content: string): ExportPoint[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const delimiter = (lines[0]!.match(/;/g)?.length ?? 0) > (lines[0]!.match(/,/g)?.length ?? 0) ? ';' : ',';
  const header = splitCsvLine(lines[0]!, delimiter).map((cell) => cell.trim().toLowerCase());

  const find = (...names: string[]) => header.findIndex((cell) => names.includes(cell));
  const latIndex = find('lat', 'latitude', 'breite', 'breitengrad');
  const lonIndex = find('lon', 'lng', 'long', 'longitude', 'länge', 'laenge', 'längengrad');
  const nameIndex = find('name', 'titel', 'title', 'bezeichnung');
  const noteIndex = find('notiz', 'notizen', 'note', 'notes', 'beschreibung', 'description');

  if (latIndex < 0 || lonIndex < 0) return [];

  const points: ExportPoint[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line, delimiter);
    const lat = Number((cells[latIndex] ?? '').replace(',', '.'));
    const lon = Number((cells[lonIndex] ?? '').replace(',', '.'));
    if (!isValidCoordinate(lat, lon)) continue;

    points.push({
      lat,
      lon,
      name: (nameIndex >= 0 ? cells[nameIndex]?.trim() : '') || 'Importierter Punkt',
      description: noteIndex >= 0 ? (cells[noteIndex]?.trim() ?? null) : null,
      time: null,
    });
  }
  return points;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      // Doppeltes Anführungszeichen innerhalb eines Feldes ist ein Zeichen.
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.replace(/^"|"$/g, ''));
}

function tagValue(body: string, tag: string): string | null {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(body);
  if (!match?.[1]) return null;
  return unescapeXml(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()) || null;
}

function isValidCoordinate(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 &&
    // 0,0 liegt im Atlantik und stammt praktisch immer aus leeren Feldern.
    !(lat === 0 && lon === 0)
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
