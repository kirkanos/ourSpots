/**
 * Fachliche Aufzaehlungen. Bewusst als const-Arrays: daraus werden sowohl die
 * Zod-Schemas als auch die TS-Typen abgeleitet, und das Frontend kann sie
 * direkt fuer Filter- und Auswahllisten verwenden.
 */

export const TRIP_STATUSES = ['planned', 'active', 'done'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const TRIP_ROLES = ['owner', 'editor', 'viewer'] as const;
export type TripRole = (typeof TRIP_ROLES)[number];

export const WAYPOINT_KINDS = ['start', 'via', 'end'] as const;
export type WaypointKind = (typeof WAYPOINT_KINDS)[number];

export const SPOT_TYPES = [
  'stellplatz',
  'campingplatz',
  'wildcamping',
  'parkplatz',
  'sonstiges',
] as const;
export type SpotType = (typeof SPOT_TYPES)[number];

export const SPOT_SOURCES = ['gps', 'manual', 'import'] as const;
export type SpotSource = (typeof SPOT_SOURCES)[number];

/** Ausstattungsmerkmale eines Stellplatzes – Basis fuer die Filterleiste. */
export const AMENITIES = [
  'strom',
  'frischwasser',
  'entsorgung_grauwasser',
  'entsorgung_chemie',
  'wc',
  'dusche',
  'wlan',
  'muell',
  'hund_erlaubt',
  'ruhig',
  'schranke',
  'wintertauglich',
  'restaurant',
  'einkauf_nah',
  'oepnv_nah',
  'badestelle',
  'spielplatz',
  'bezahlung_karte',
] as const;
export type Amenity = (typeof AMENITIES)[number];

/** Deutsche Beschriftungen fuer die Oberflaeche. */
export const AMENITY_LABELS: Record<Amenity, string> = {
  strom: 'Strom',
  frischwasser: 'Frischwasser',
  entsorgung_grauwasser: 'Grauwasser-Entsorgung',
  entsorgung_chemie: 'Chemie-WC-Entsorgung',
  wc: 'WC',
  dusche: 'Dusche',
  wlan: 'WLAN',
  muell: 'Müllentsorgung',
  hund_erlaubt: 'Hunde erlaubt',
  ruhig: 'Ruhig',
  schranke: 'Schranke',
  wintertauglich: 'Wintertauglich',
  restaurant: 'Restaurant',
  einkauf_nah: 'Einkauf in der Nähe',
  oepnv_nah: 'ÖPNV in der Nähe',
  badestelle: 'Badestelle',
  spielplatz: 'Spielplatz',
  bezahlung_karte: 'Kartenzahlung',
};

export const SPOT_TYPE_LABELS: Record<SpotType, string> = {
  stellplatz: 'Stellplatz',
  campingplatz: 'Campingplatz',
  wildcamping: 'Freistehen',
  parkplatz: 'Parkplatz',
  sonstiges: 'Sonstiges',
};

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  planned: 'Geplant',
  active: 'Unterwegs',
  done: 'Abgeschlossen',
};

export const EXPENSE_CATEGORIES = [
  'sprit',
  'stellplatz',
  'maut',
  'essen',
  'freizeit',
  'sonstiges',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const ROUTE_PREFERENCES = ['recommended', 'fastest', 'shortest'] as const;
export type RoutePreference = (typeof ROUTE_PREFERENCES)[number];
