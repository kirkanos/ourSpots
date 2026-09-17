/**
 * Beispieldaten fuer die lokale Entwicklung.
 *
 * Bewusst mit festen IDs: der Seed ist damit wiederholbar und Links auf eine
 * Reise bleiben ueber ein Zuruecksetzen hinweg gueltig.
 *
 *   npm run db:seed
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Stabile, gueltig geformte UUIDv7 aus Typ und laufender Nummer.
 *
 * Die IDs muessen echte Hex-UUIDs sein: die API validiert Fremdschluessel mit
 * `z.string().uuid()`, ein sprechendes Kuerzel im letzten Block wuerde beim
 * Speichern eines Seed-Datensatzes abgelehnt.
 */
const KIND: Record<string, string> = {
  user: '01',
  veh: '02',
  trip: '03',
  stg: '04',
  wp: '05',
  dia: '06',
  fuel: '07',
  exp: '08',
  spot: '09',
};

function id(kind: keyof typeof KIND | string, n: number): string {
  const code = KIND[kind];
  if (!code) throw new Error(`Unbekannte Datensatzart im Seed: ${kind}`);
  return `01900000-0000-7000-8000-${code}${n.toString(16).padStart(10, '0')}`;
}

const USER_DEV = id('user', 1);
const USER_PARTNER = id('user', 2);
const VEHICLE = id('veh', 1);
const TRIP_NORDSEE = id('trip', 1);
const TRIP_TOSKANA = id('trip', 2);

const date = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Der Seed darf nicht gegen eine Produktivdatenbank laufen.');
  }

  console.log('Vorhandene Beispieldaten werden entfernt …');
  // Reihenfolge egal: alles haengt per onDelete: Cascade an Reise bzw. Nutzer.
  await prisma.spot.deleteMany({});
  await prisma.trip.deleteMany({});
  await prisma.vehicle.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.user.deleteMany({});

  await prisma.user.createMany({
    data: [
      {
        id: USER_DEV,
        oidcSub: 'dev-local-user',
        email: 'entwicklung@localhost',
        displayName: 'Lokaler Testnutzer',
      },
      {
        id: USER_PARTNER,
        oidcSub: 'dev-partner',
        email: 'mitreisende@localhost',
        displayName: 'Mitreisende Person',
      },
    ],
  });

  await prisma.vehicle.create({
    data: {
      id: VEHICLE,
      ownerId: USER_DEV,
      name: 'Kastenwagen 6,4 m',
      heightM: 2.85,
      widthM: 2.05,
      lengthM: 6.4,
      weightT: 3.5,
      axles: 2,
      consumptionL100km: 9.8,
    },
  });

  // --- Reise 1: laufend, mit Etappen, Route, Tagebuch und Kosten ------------

  await prisma.trip.create({
    data: {
      id: TRIP_NORDSEE,
      ownerId: USER_DEV,
      vehicleId: VEHICLE,
      title: 'Nordsee im Frühjahr',
      description: 'Ostfriesland und Nordfriesland, viel Wind und Krabbenbrötchen.',
      startDate: date('2026-04-10'),
      endDate: date('2026-04-24'),
      status: 'active',
      members: { create: [{ userId: USER_PARTNER, role: 'editor' }] },
      stages: {
        create: [
          { id: id('stg', 1), seq: 0, title: 'Anreise nach Bremen', date: date('2026-04-10') },
          { id: id('stg', 2), seq: 1, title: 'Weiter nach Greetsiel', date: date('2026-04-12') },
          { id: id('stg', 3), seq: 2, title: 'Hoch nach Husum', date: date('2026-04-15') },
        ],
      },
      waypoints: {
        create: [
          { id: id('wp', 1), seq: 0, kind: 'start', name: 'Zuhause', lat: 49.6008, lon: 10.1112, stageId: id('stg', 1) },
          { id: id('wp', 2), seq: 1, kind: 'via', name: 'Bremen', lat: 53.0793, lon: 8.8017, stageId: id('stg', 1), plannedNights: 2 },
          { id: id('wp', 3), seq: 2, kind: 'via', name: 'Greetsiel', lat: 53.5034, lon: 7.1042, stageId: id('stg', 2), plannedNights: 3 },
          { id: id('wp', 4), seq: 3, kind: 'end', name: 'Husum', lat: 54.4736, lon: 9.0518, stageId: id('stg', 3), plannedNights: 2 },
        ],
      },
      diary: {
        create: [
          {
            id: id('dia', 1),
            date: date('2026-04-10'),
            title: 'Losgefahren',
            text: 'Spät los, dafür freie Autobahn. Abends noch Fischbrötchen am Hafen.',
            odometerKm: 84210,
            weather: 'bewölkt, 11 °C',
          },
          {
            id: id('dia', 2),
            date: date('2026-04-12'),
            title: 'Greetsiel',
            text: 'Morgens kamen die Krabbenkutter rein. Windig, aber sonnig.',
            odometerKm: 84455,
            weather: 'sonnig, 9 °C',
          },
        ],
      },
      fuelLogs: {
        create: [
          { id: id('fuel', 1), date: date('2026-04-10'), liters: 62.4, pricePerL: 1.719, totalCost: 107.27, odometerKm: 84210, isFull: true },
          { id: id('fuel', 2), date: date('2026-04-15'), liters: 48.1, pricePerL: 1.689, totalCost: 81.24, odometerKm: 84698, isFull: true },
        ],
      },
      expenses: {
        create: [
          { id: id('exp', 1), date: date('2026-04-10'), category: 'stellplatz', amount: 18, note: 'Bremen, 2 Nächte' },
          { id: id('exp', 2), date: date('2026-04-12'), category: 'essen', amount: 34.5, note: 'Fischbrötchen und Einkauf' },
          { id: id('exp', 3), date: date('2026-04-13'), category: 'freizeit', amount: 24, note: 'Wattwanderung' },
        ],
      },
    },
  });

  // --- Reise 2: abgeschlossen ----------------------------------------------

  await prisma.trip.create({
    data: {
      id: TRIP_TOSKANA,
      ownerId: USER_DEV,
      vehicleId: VEHICLE,
      title: 'Toskana im Herbst',
      description: 'Zwei Wochen zwischen Zypressen, Agriturismo-Stellplätzen und Thermalquellen.',
      startDate: date('2025-09-20'),
      endDate: date('2025-10-05'),
      status: 'done',
      waypoints: {
        create: [
          { id: id('wp', 11), seq: 0, kind: 'start', name: 'Zuhause', lat: 49.6008, lon: 10.1112 },
          { id: id('wp', 12), seq: 1, kind: 'via', name: 'Brennerpass', lat: 47.0025, lon: 11.5061 },
          { id: id('wp', 13), seq: 2, kind: 'via', name: 'Siena', lat: 43.3188, lon: 11.3308, plannedNights: 3 },
          { id: id('wp', 14), seq: 3, kind: 'end', name: 'Saturnia', lat: 42.6653, lon: 11.5075, plannedNights: 2 },
        ],
      },
    },
  });

  // --- Stellplaetze ---------------------------------------------------------

  const spots: {
    n: number;
    trip: string | null;
    name: string;
    lat: number;
    lon: number;
    address: string;
    country: string;
    type: string;
    visitedAt: string;
    nights: number;
    rating: number | null;
    price: number | null;
    notes: string;
    amenities: string[];
  }[] = [
    {
      n: 1, trip: TRIP_NORDSEE, name: 'Hafenstellplatz Greetsiel', lat: 53.5034, lon: 7.1042,
      address: 'Greetsiel, Krummhörn, Niedersachsen', country: 'DE', type: 'stellplatz',
      visitedAt: '2026-04-12', nights: 3, rating: 5, price: 12.5,
      notes: 'Direkt am Hafen. Morgens laufen die Krabbenkutter ein, das ist jeden Tag sehenswert. Automat nimmt nur Karte.',
      amenities: ['strom', 'frischwasser', 'entsorgung_grauwasser', 'muell', 'ruhig', 'bezahlung_karte', 'einkauf_nah'],
    },
    {
      n: 2, trip: TRIP_NORDSEE, name: 'Wohnmobilhafen Bremen', lat: 53.0928, lon: 8.8072,
      address: 'Bremen, Bremen', country: 'DE', type: 'stellplatz',
      visitedAt: '2026-04-10', nights: 2, rating: 3, price: 15,
      notes: 'Zweckmäßig und zentral, aber laut durch die nahe Straße. Für einen Stadtbesuch trotzdem ideal.',
      amenities: ['strom', 'frischwasser', 'wc', 'dusche', 'oepnv_nah', 'schranke'],
    },
    {
      n: 3, trip: TRIP_NORDSEE, name: 'Deichwiese bei Husum', lat: 54.4736, lon: 9.0518,
      address: 'Husum, Schleswig-Holstein', country: 'DE', type: 'wildcamping',
      visitedAt: '2026-04-15', nights: 1, rating: 4, price: null,
      notes: 'Freistehen mit Blick auf den Deich. Keine Versorgung, dafür absolute Ruhe und ein guter Sonnenuntergang.',
      amenities: ['ruhig', 'badestelle'],
    },
    {
      n: 4, trip: TRIP_NORDSEE, name: 'Campingplatz Norddeich', lat: 53.6156, lon: 7.1608,
      address: 'Norden, Niedersachsen', country: 'DE', type: 'campingplatz',
      visitedAt: '2026-04-14', nights: 1, rating: 4, price: 28,
      notes: 'Teuer, aber mit allem. Gute Duschen, direkt an der Fähre nach Norderney.',
      amenities: ['strom', 'frischwasser', 'wc', 'dusche', 'wlan', 'muell', 'restaurant', 'spielplatz', 'hund_erlaubt'],
    },
    {
      n: 5, trip: TRIP_TOSKANA, name: 'Agriturismo bei Siena', lat: 43.3188, lon: 11.3308,
      address: 'Siena, Toskana', country: 'IT', type: 'stellplatz',
      visitedAt: '2025-09-25', nights: 3, rating: 5, price: 20,
      notes: 'Zwischen Olivenbäumen, abends Wein vom Hof. Zufahrt eng, mit über 7 m Länge schwierig.',
      amenities: ['strom', 'frischwasser', 'wc', 'ruhig', 'hund_erlaubt', 'restaurant'],
    },
    {
      n: 6, trip: TRIP_TOSKANA, name: 'Parkplatz Thermen Saturnia', lat: 42.6653, lon: 11.5075,
      address: 'Saturnia, Toskana', country: 'IT', type: 'parkplatz',
      visitedAt: '2025-10-01', nights: 2, rating: 3, price: 15,
      notes: 'Reiner Parkplatz, nachts kommen Leute zu den Quellen. Der Weg zu den Kaskaden ist kurz.',
      amenities: ['muell', 'badestelle'],
    },
    {
      n: 7, trip: TRIP_TOSKANA, name: 'Sosta Bolsena', lat: 42.6435, lon: 11.9866,
      address: 'Bolsena, Latium', country: 'IT', type: 'stellplatz',
      visitedAt: '2025-09-22', nights: 1, rating: 4, price: 18,
      notes: 'Am See, Schwimmen direkt möglich. Schatten nur auf den hinteren Plätzen.',
      amenities: ['strom', 'frischwasser', 'entsorgung_grauwasser', 'badestelle', 'einkauf_nah'],
    },
    {
      n: 8, trip: null, name: 'Stellplatz am Möhnesee', lat: 51.4917, lon: 8.1206,
      address: 'Möhnesee, Nordrhein-Westfalen', country: 'DE', type: 'stellplatz',
      visitedAt: '2025-06-14', nights: 1, rating: 4, price: 10,
      notes: 'Gute Zwischenstation auf dem Weg nach Norden. Bäcker zu Fuß erreichbar.',
      amenities: ['strom', 'frischwasser', 'muell', 'einkauf_nah', 'badestelle'],
    },
    {
      n: 9, trip: null, name: 'Camperplaats Zeeland', lat: 51.5405, lon: 3.6805,
      address: 'Vrouwenpolder, Zeeland', country: 'NL', type: 'stellplatz',
      visitedAt: '2025-08-03', nights: 2, rating: 5, price: 22,
      notes: 'Dünen direkt hinter dem Platz. Reservierung im Sommer nötig.',
      amenities: ['strom', 'frischwasser', 'entsorgung_grauwasser', 'entsorgung_chemie', 'wc', 'dusche', 'wlan', 'badestelle'],
    },
    {
      n: 10, trip: null, name: 'Rastplatz Vogesen', lat: 48.0742, lon: 7.0418,
      address: 'Munster, Grand Est', country: 'FR', type: 'parkplatz',
      visitedAt: '2024-10-12', nights: 1, rating: 2, price: null,
      notes: 'Nur als Notlösung. Nachts laut durch Lkw, morgens kalt und neblig.',
      amenities: [],
    },
  ];

  for (const spot of spots) {
    await prisma.spot.create({
      data: {
        id: id('spot', spot.n),
        tripId: spot.trip,
        createdById: USER_DEV,
        name: spot.name,
        lat: spot.lat,
        lon: spot.lon,
        address: spot.address,
        country: spot.country,
        type: spot.type,
        visitedAt: date(spot.visitedAt),
        nights: spot.nights,
        rating: spot.rating,
        pricePerNight: spot.price,
        notes: spot.notes,
        source: 'manual',
        amenities: { create: spot.amenities.map((amenity) => ({ amenity })) },
      },
    });
  }

  console.log(`Fertig: 2 Nutzer, 2 Reisen, ${spots.length} Stellplätze, 1 Fahrzeug.`);
  console.log('Anmelden mit „Lokal anmelden" – das ist der Nutzer „Lokaler Testnutzer".');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
