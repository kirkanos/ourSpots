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

export const stageInputSchema = z.object({
  id: uuid.optional(),
  seq: z.number().int().min(0),
  title: trimmed(200).nullish(),
  date: isoDate.nullish(),
  notes: trimmed(5000).nullish(),
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
