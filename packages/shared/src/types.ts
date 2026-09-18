import type {
  Amenity,
  ExpenseCategory,
  SpotSource,
  SpotType,
  TripRole,
  TripStatus,
  WaypointKind,
} from './enums';

/** Was die API zurueckliefert – bewusst getrennt von den Eingabe-Schemas. */

export interface HomeDto {
  name: string;
  lat: number;
  lon: number;
  address: string | null;
}

export interface UserDto {
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  /** Heimatadresse, falls hinterlegt – Vorschlag fuer Start und Ziel. */
  home: HomeDto | null;
}

export interface VehicleDto {
  id: string;
  name: string;
  heightM: number | null;
  widthM: number | null;
  lengthM: number | null;
  weightT: number | null;
  axles: number | null;
  consumptionL100km: number | null;
}

export interface TripMemberDto {
  userId: string;
  role: TripRole;
  user: UserDto;
}

export interface TripDto {
  id: string;
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  status: TripStatus;
  vehicleId: string | null;
  coverPhotoId: string | null;
  ownerId: string;
  /** Rolle des anfragenden Nutzers – steuert die Bearbeitbarkeit im Frontend. */
  myRole: TripRole;
  spotCount: number;
  members?: TripMemberDto[];
  createdAt: string;
  updatedAt: string;
}

export interface StageDto {
  id: string;
  tripId: string;
  seq: number;
  title: string | null;
  date: string | null;
  notes: string | null;
  /** Rastort, an dem die Etappe endet. */
  lat: number | null;
  lon: number | null;
  address: string | null;
}

export interface WaypointDto {
  id: string;
  tripId: string;
  stageId: string | null;
  seq: number;
  kind: WaypointKind;
  name: string;
  lat: number;
  lon: number;
  address: string | null;
  plannedArrival: string | null;
  plannedNights: number | null;
  locked: boolean;
}

export interface RouteDto {
  id: string;
  tripId: string;
  stageId: string | null;
  distanceM: number;
  durationS: number;
  /** Encoded Polyline (Praezision 5), wie von OpenRouteService geliefert. */
  geometry: string;
  bbox: [number, number, number, number] | null;
  computedAt: string;
  /** true, wenn die Antwort aus dem Cache kam und kein API-Call noetig war. */
  cached: boolean;
}

/** Ergebnis der Reihenfolgen-Optimierung – wird erst nach Bestätigung übernommen. */
export interface OptimizeResultDto {
  /**
   * Was umsortiert wurde: Bei Reisen mit Rastorten je Etappe die Etappen,
   * sonst die Wegpunkte zwischen Start und Ziel.
   */
  target: 'stages' | 'waypoints';
  /** Wegpunkt-IDs in der vorgeschlagenen Reihenfolge; leer bei `stages`. */
  waypointIds: string[];
  /** Etappen-IDs in der vorgeschlagenen Reihenfolge; leer bei `waypoints`. */
  stageIds: string[];
  distanceM: number;
  durationS: number;
  /** Ersparnis gegenüber der bisherigen Reihenfolge, in Metern. */
  savedM: number;
}

export interface RouteLegDto {
  /** Null für die Gesamtroute der Reise. */
  stageId: string | null;
  stageTitle: string | null;
  distanceM: number;
  durationS: number;
  geometry: string;
  cached: boolean;
}

export interface TripRouteDto {
  tripId: string;
  profile: string;
  /** Eine Etappe pro Eintrag; ohne Etappen genau ein Eintrag. */
  legs: RouteLegDto[];
  totalDistanceM: number;
  totalDurationS: number;
  bbox: [number, number, number, number] | null;
  /** Hinweise, etwa wenn keine Fahrzeugmaße hinterlegt sind. */
  notes: string[];
}

export interface PhotoDto {
  id: string;
  spotId: string | null;
  diaryEntryId: string | null;
  width: number;
  height: number;
  takenAt: string | null;
  lat: number | null;
  lon: number | null;
  caption: string | null;
  sortIndex: number;
}

export interface SpotDto {
  id: string;
  tripId: string | null;
  createdById: string;
  name: string;
  lat: number;
  lon: number;
  address: string | null;
  country: string | null;
  type: SpotType;
  visitedAt: string | null;
  nights: number | null;
  rating: number | null;
  pricePerNight: number | null;
  currency: string;
  notes: string | null;
  isPrivateNote: boolean;
  source: SpotSource;
  amenities: Amenity[];
  photos: PhotoDto[];
  /** Nur bei Umkreissuche gesetzt. */
  distanceKm?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PagedResult<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}

export interface DiaryEntryDto {
  id: string;
  tripId: string;
  date: string;
  title: string | null;
  text: string | null;
  odometerKm: number | null;
  weather: string | null;
  photos: PhotoDto[];
}

export interface FuelLogDto {
  id: string;
  tripId: string;
  date: string;
  lat: number | null;
  lon: number | null;
  liters: number;
  pricePerL: number | null;
  totalCost: number | null;
  odometerKm: number | null;
  isFull: boolean;
}

export interface ExpenseDto {
  id: string;
  tripId: string;
  date: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  note: string | null;
}

/** Auswertung einer Reise: Kosten, Strecke und Verbrauch. */
export interface TripStatsDto {
  tripId: string;
  /** Aus den Kilometerständen von Tagebuch und Tankungen. */
  distanceKm: number | null;
  fuelLiters: number;
  fuelCost: number;
  /** Nur aus aufeinanderfolgenden Volltankungen berechenbar. */
  consumptionL100km: number | null;
  expensesByCategory: { category: ExpenseCategory; amount: number }[];
  otherCost: number;
  totalCost: number;
  costPerDay: number | null;
  costPerKm: number | null;
  nights: number;
  spotCount: number;
  averageRating: number | null;
  averagePricePerNight: number | null;
}

export interface ShareLinkDto {
  id: string;
  token: string;
  /** Vollständige URL zum Weitergeben. */
  url: string;
  expiresAt: string | null;
  includePhotos: boolean;
  revokedAt: string | null;
  createdAt: string;
}

/** Was ein öffentlicher Link ausliefert – ohne private Notizen. */
export interface PublicTripDto {
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  ownerName: string;
  includePhotos: boolean;
  waypoints: {
    seq: number;
    kind: WaypointKind;
    name: string;
    lat: number;
    lon: number;
  }[];
  spots: {
    id: string;
    name: string;
    lat: number;
    lon: number;
    type: SpotType;
    visitedAt: string | null;
    rating: number | null;
    pricePerNight: number | null;
    notes: string | null;
    amenities: Amenity[];
    photoIds: string[];
  }[];
}

export interface ImportResultDto {
  imported: number;
  skipped: number;
  /** Verständliche Hinweise zu übersprungenen Einträgen. */
  messages: string[];
}

export interface GeocodeResultDto {
  displayName: string;
  lat: number;
  lon: number;
  type: string | null;
  country: string | null;
  boundingBox: [number, number, number, number] | null;
}
