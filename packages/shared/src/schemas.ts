import { z } from 'zod';
import {
  AMENITIES,
  EXPENSE_CATEGORIES,
  ROUTE_PREFERENCES,
  SPOT_SOURCES,
  SPOT_TYPES,
  TRIP_ROLES,
  TRIP_STATUSES,
  WAYPOINT_KINDS,
} from './enums';

/**
 * IDs werden vom Client als UUIDv7 erzeugt. Das ist die Voraussetzung dafuer,
 * dass offline angelegte Datensaetze ohne Server-Roundtrip eine stabile
 * Identitaet haben und ein spaeter wiederholter Sync idempotent bleibt.
 */
export const uuid = z.string().uuid();

export const latitude = z.number().min(-90).max(90);
export const longitude = z.number().min(-180).max(180);

/** Nur Datum, ohne Zeitzone – Reisetage sollen nicht durch UTC verrutschen. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Erwartet wird ein Datum im Format JJJJ-MM-TT');

const trimmed = (max: number) => z.string().trim().max(max);

// ---------------------------------------------------------------------------
// Nutzerprofil
// ---------------------------------------------------------------------------

/**
 * Heimatadresse. Geloescht wird sie ueber DELETE, nicht ueber einen
 * `null`-Body: Der JSON-Parser nimmt im Strict-Modus nur Objekte an.
 */
export const homeInputSchema = z.object({
  name: trimmed(200).min(1, 'Die Heimatadresse braucht eine Bezeichnung'),
  lat: latitude,
  lon: longitude,
  address: trimmed(500).nullish(),
});
export type HomeInput = z.infer<typeof homeInputSchema>;

// ---------------------------------------------------------------------------
// Fahrzeug
// ---------------------------------------------------------------------------

export const vehicleInputSchema = z.object({
  name: trimmed(120).min(1, 'Name darf nicht leer sein'),
  heightM: z.number().min(1).max(5).nullish(),
  widthM: z.number().min(1).max(4).nullish(),
  lengthM: z.number().min(2).max(20).nullish(),
  weightT: z.number().min(0.5).max(40).nullish(),
  axles: z.number().int().min(2).max(6).nullish(),
  consumptionL100km: z.number().min(1).max(60).nullish(),
});
export type VehicleInput = z.infer<typeof vehicleInputSchema>;

// ---------------------------------------------------------------------------
// Reise
// ---------------------------------------------------------------------------

export const tripInputSchema = z
  .object({
    title: trimmed(200).min(1, 'Titel darf nicht leer sein'),
    description: trimmed(5000).nullish(),
    startDate: isoDate.nullish(),
    endDate: isoDate.nullish(),
    status: z.enum(TRIP_STATUSES).default('planned'),
    vehicleId: uuid.nullish(),
  })
  .refine(
    (t) => !t.startDate || !t.endDate || t.startDate <= t.endDate,
    { message: 'Das Ende der Reise liegt vor dem Beginn', path: ['endDate'] },
  );
export type TripInput = z.infer<typeof tripInputSchema>;

export const tripMemberInputSchema = z.object({
  email: z.string().email(),
  role: z.enum(TRIP_ROLES).exclude(['owner']),
});
export type TripMemberInput = z.infer<typeof tripMemberInputSchema>;

// ---------------------------------------------------------------------------
// Etappen und Wegpunkte
// ---------------------------------------------------------------------------

export const stageInputSchema = z
  .object({
    id: uuid.optional(),
    seq: z.number().int().min(0),
    title: trimmed(200).nullish(),
    date: isoDate.nullish(),
    notes: trimmed(5000).nullish(),
    /** Rastort, an dem die Etappe endet – beide Koordinaten oder keine. */
    lat: latitude.nullish(),
    lon: longitude.nullish(),
    address: trimmed(500).nullish(),
  })
  .refine((stage) => (stage.lat == null) === (stage.lon == null), {
    message: 'Zum Etappenziel gehören immer Breiten- und Längengrad',
    path: ['lat'],
  });
export type StageInput = z.infer<typeof stageInputSchema>;

export const waypointInputSchema = z.object({
  id: uuid.optional(),
  stageId: uuid.nullish(),
  seq: z.number().int().min(0),
  kind: z.enum(WAYPOINT_KINDS).default('via'),
  name: trimmed(200).min(1),
  lat: latitude,
  lon: longitude,
  address: trimmed(500).nullish(),
  plannedArrival: isoDate.nullish(),
  plannedNights: z.number().int().min(0).max(365).nullish(),
  /** Bei der Reihenfolgen-Optimierung nicht verschieben. */
  locked: z.boolean().default(false),
});
export type WaypointInput = z.infer<typeof waypointInputSchema>;

/** Wegpunkte werden immer als komplette, sortierte Liste gespeichert. */
export const waypointBulkSchema = z.object({
  waypoints: z.array(waypointInputSchema).max(200),
});

/** Etappen ebenso – das hält die Reihenfolge lückenlos. */
export const stageBulkSchema = z.object({
  stages: z.array(stageInputSchema).max(100),
});

// ---------------------------------------------------------------------------
// Routenberechnung
// ---------------------------------------------------------------------------

export const routeOptionsSchema = z.object({
  /** Ohne stageId wird die Gesamtroute der Reise berechnet. */
  stageId: uuid.nullish(),
  preference: z.enum(ROUTE_PREFERENCES).default('recommended'),
  avoidTollways: z.boolean().default(false),
  avoidFerries: z.boolean().default(false),
  avoidHighways: z.boolean().default(false),
  /** Erzwingt eine Neuberechnung trotz gueltigem Cache-Eintrag. */
  force: z.boolean().default(false),
});
export type RouteOptions = z.infer<typeof routeOptionsSchema>;

export const optimizeOptionsSchema = z.object({
  stageId: uuid.nullish(),
  /** Start und Ziel bleiben immer fest; nur die Zwischenziele werden sortiert. */
  keepEnds: z.boolean().default(true),
});
export type OptimizeOptions = z.infer<typeof optimizeOptionsSchema>;

// ---------------------------------------------------------------------------
// Stellplatz
// ---------------------------------------------------------------------------

export const spotInputSchema = z.object({
  tripId: uuid.nullish(),
  name: trimmed(200).min(1, 'Name darf nicht leer sein'),
  lat: latitude,
  lon: longitude,
  address: trimmed(500).nullish(),
  country: trimmed(2).nullish(),
  type: z.enum(SPOT_TYPES).default('stellplatz'),
  visitedAt: isoDate.nullish(),
  nights: z.number().int().min(0).max(365).nullish(),
  rating: z.number().int().min(1).max(5).nullish(),
  pricePerNight: z.number().min(0).max(1000).nullish(),
  currency: trimmed(3).default('EUR'),
  notes: trimmed(10000).nullish(),
  /** Private Notizen erscheinen nie in einem oeffentlichen Teilen-Link. */
  isPrivateNote: z.boolean().default(false),
  source: z.enum(SPOT_SOURCES).default('manual'),
  amenities: z.array(z.enum(AMENITIES)).default([]),
});
export type SpotInput = z.infer<typeof spotInputSchema>;

/** Zahlen und Booleans kommen aus der Query als Strings an. */
const queryNumber = z.coerce.number();
const queryBool = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

export const spotQuerySchema = z.object({
  /** Volltextsuche ueber Name, Adresse und Notizen. */
  q: trimmed(200).optional(),
  /** Kartenausschnitt als "minLon,minLat,maxLon,maxLat". */
  bbox: z
    .string()
    .regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/, 'bbox erwartet 4 Kommazahlen')
    .optional(),
  tripId: uuid.optional(),
  type: z.enum(SPOT_TYPES).optional(),
  minRating: queryNumber.int().min(1).max(5).optional(),
  maxPrice: queryNumber.min(0).optional(),
  /** Alle genannten Merkmale muessen vorhanden sein (UND-Verknuepfung). */
  amenities: z
    .union([z.array(z.enum(AMENITIES)), z.enum(AMENITIES)])
    .transform((v) => (Array.isArray(v) ? v : [v]))
    .optional(),
  country: trimmed(2).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  /** Umkreissuche: "lat,lon" plus Radius in Kilometern. */
  near: z.string().regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/).optional(),
  radiusKm: queryNumber.min(0.1).max(2000).optional(),
  onlyMine: queryBool.optional(),
  sort: z.enum(['visitedAt', 'rating', 'name', 'distance', 'createdAt']).default('visitedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: queryNumber.int().min(1).max(500).default(100),
  cursor: z.string().optional(),
});
export type SpotQuery = z.infer<typeof spotQuerySchema>;

// ---------------------------------------------------------------------------
// Tagebuch, Tanken, Kosten
// ---------------------------------------------------------------------------

export const diaryEntryInputSchema = z.object({
  date: isoDate,
  title: trimmed(200).nullish(),
  text: trimmed(20000).nullish(),
  odometerKm: z.number().int().min(0).max(2_000_000).nullish(),
  weather: trimmed(100).nullish(),
});
export type DiaryEntryInput = z.infer<typeof diaryEntryInputSchema>;

export const fuelLogInputSchema = z.object({
  date: isoDate,
  lat: latitude.nullish(),
  lon: longitude.nullish(),
  liters: z.number().min(0.1).max(500),
  pricePerL: z.number().min(0).max(20).nullish(),
  totalCost: z.number().min(0).max(5000).nullish(),
  odometerKm: z.number().int().min(0).max(2_000_000).nullish(),
  /** Nur Volltankungen erlauben eine korrekte Verbrauchsrechnung. */
  isFull: z.boolean().default(true),
});
export type FuelLogInput = z.infer<typeof fuelLogInputSchema>;

export const expenseInputSchema = z.object({
  date: isoDate,
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().min(0).max(100000),
  currency: trimmed(3).default('EUR'),
  note: trimmed(500).nullish(),
});
export type ExpenseInput = z.infer<typeof expenseInputSchema>;

// ---------------------------------------------------------------------------
// Teilen
// ---------------------------------------------------------------------------

export const shareLinkInputSchema = z.object({
  expiresAt: z.string().datetime().nullish(),
  includePhotos: z.boolean().default(true),
});
export type ShareLinkInput = z.infer<typeof shareLinkInputSchema>;

// ---------------------------------------------------------------------------
// Geocoding
// ---------------------------------------------------------------------------

export const geocodeQuerySchema = z.object({
  q: trimmed(200).min(2, 'Bitte mindestens zwei Zeichen eingeben'),
  limit: queryNumber.int().min(1).max(20).default(8),
});

export const reverseQuerySchema = z.object({
  lat: queryNumber.pipe(latitude),
  lon: queryNumber.pipe(longitude),
});

// ---------------------------------------------------------------------------
// Reisevideo
// ---------------------------------------------------------------------------

/**
 * Die Einstellungen der Vorschau, so wie sie an den Renderer gehen.
 *
 * Bewusst dasselbe Objekt wie in der Oberflaeche: Was der Nutzer sieht, wird
 * unveraendert weitergereicht. Die Grenzen hier sind die der Regler -- sie
 * halten einen manipulierten Aufruf davon ab, den Renderer mit einer Stunde
 * Video oder achtfacher Ueberhoehung zu beschaeftigen.
 */
/**
 * Ein Punkt entlang der Reise: Kamerahöhe, Neigung und Tempo an dieser Stelle.
 * Die Position hängt am Streckenanteil, nicht an der Videozeit – sonst
 * wanderte sie, sobald jemand die Sekunden je 100 km ändert.
 */
export const kamerapunktSchema = z.object({
  anteil: z.number().min(0).max(1),
  zoom: z.number().min(3).max(16),
  neigung: z.number().min(0).max(80),
  tempo: z.number().min(0.25).max(8).default(1),
});
export type Kamerapunkt = z.infer<typeof kamerapunktSchema>;

export const videoEinstellungenSchema = z.object({
  sekundenProHundertKm: z.number().min(0.5).max(60),
  haltSekunden: z.number().min(0).max(30),
  vorspannSekunden: z.number().min(0).max(30),
  abspannSekunden: z.number().min(0).max(30),
  fahrtZoom: z.number().min(3).max(16),
  haltZoom: z.number().min(3).max(16),
  neigung: z.number().min(0).max(80),
  kameraDrehtMit: z.boolean(),
  /**
   * Obergrenze mit Grund: Jeder Punkt ist ein Regler in der Oberfläche, und
   * der Renderer wertet die Kurve je Bild aus. Fünfzig sind weit mehr, als
   * eine Reise je braucht.
   */
  kameraPunkte: z.array(kamerapunktSchema).max(50).default([]),
});
export type VideoEinstellungen = z.infer<typeof videoEinstellungenSchema>;

export const VIDEO_STILE = ['liberty', 'bright', 'positron', 'satellit', 'raster'] as const;
export const VIDEO_MARKER = ['wohnmobil', 'auto', 'punkt'] as const;

/**
 * Auflösungen als feste Stufen – freie Werte brächten nur krumme Videomaße.
 *
 * `breite`/`hoehe` sind die Maße der Bühne in CSS-Pixeln, `skala` die
 * Pixeldichte. Das Video wird `breite × skala` mal `hoehe × skala` groß.
 *
 * Alle Stufen teilen sich **dieselbe Bühne** und unterscheiden sich nur in der
 * Dichte. Das ist bei einer Vektorkarte der ganze Punkt: Ein breiteres Fenster
 * zeigt bei gleicher Zoomstufe mehr Landschaft, nicht dieselbe schärfer. So
 * bleibt der Bildausschnitt über alle Stufen gleich, und die Auflösung ist
 * allein eine Frage der Schärfe – auch die Marker behalten ihre Größe im Bild.
 *
 * Deshalb ist auch Hochrechnen eines fertigen Videos nie sinnvoll: Es erfände
 * Details, die aus den Vektordaten ohnehin vorliegen.
 *
 * `2 / 3` steht bewusst als Bruch da. Chromium rundet die Fotomaße, und damit
 * ergibt 1920 × 2/3 genau 1280. Eine gerundete 0.667 ergäbe 1281 – eine
 * ungerade Breite, die libx264 mit yuv420p zurückweist.
 */
export const VIDEO_GROESSEN = {
  '720p': { breite: 1920, hoehe: 1080, skala: 2 / 3 },
  '1080p': { breite: 1920, hoehe: 1080, skala: 1 },
  '4k': { breite: 1920, hoehe: 1080, skala: 2 },
} as const;

/** Die Maße der fertigen Datei. */
export function videoAufloesung(groesse: keyof typeof VIDEO_GROESSEN): {
  breite: number;
  hoehe: number;
} {
  const g = VIDEO_GROESSEN[groesse];
  return { breite: Math.round(g.breite * g.skala), hoehe: Math.round(g.hoehe * g.skala) };
}

export const videoInputSchema = z.object({
  stil: z.enum(VIDEO_STILE).default('liberty'),
  marker: z.enum(VIDEO_MARKER).default('wohnmobil'),
  gelaende: z.boolean().default(true),
  ueberhoehung: z.number().min(1).max(8).default(3),
  ruhigeBeschriftung: z.boolean().default(true),
  einstellungen: videoEinstellungenSchema,
  groesse: z.enum(['720p', '1080p', '4k']).default('720p'),
  bilderProSekunde: z.number().int().min(12).max(30).default(25),
});
export type VideoInput = z.infer<typeof videoInputSchema>;
