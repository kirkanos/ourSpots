/**
 * Prueft, welche Orte einer Reise zu Stationen werden.
 *
 * Daran haengen die Schilder im Video. Im fertigen Film faellt ein fehlendes
 * Schild erst nach einer Stunde Rendern auf, und auch dann sieht man nur, dass
 * etwas fehlt -- nicht, warum.
 */
import { encodePolyline, type TripRouteDto, type WaypointDto } from '@ourspots/shared';
import { baueReisedaten } from '../src/video/reisedaten';

let fehler = 0;
const pruefe = (name: string, ok: boolean, zusatz = '') => {
  console.log((ok ? '  ok   ' : '  FEHL ') + name + (zusatz ? '  ' + zusatz : ''));
  if (!ok) fehler++;
};

/** Gerade Strecke von (8, 50) nach (8, 51) – rund 111 km. */
const punkte = Array.from({ length: 201 }, (_, i) => [50 + i * 0.005, 8] as [number, number]);

const leg = (titel: string, p: [number, number][]) => ({
  stageId: null,
  stageTitle: titel,
  distanceM: 111_000,
  durationS: 3600,
  ascentM: null,
  descentM: null,
  geometry: encodePolyline(p),
  cached: true,
});

const route = (legs: ReturnType<typeof leg>[]): TripRouteDto =>
  ({
    legs,
    bbox: null,
    notes: [],
    profile: 'driving-car',
    distanceM: 111_000 * legs.length,
    durationS: 3600 * legs.length,
    ascentM: null,
    descentM: null,
  }) as unknown as TripRouteDto;

const wp = (name: string, lat: number, lon: number): WaypointDto =>
  ({
    id: name,
    tripId: 't',
    stageId: null,
    seq: 0,
    kind: 'via',
    name,
    lat,
    lon,
    address: null,
    plannedArrival: null,
    plannedNights: null,
    locked: false,
  }) as unknown as WaypointDto;

// --- Wegpunkte unterwegs werden Stationen --------------------------------
{
  const daten = baueReisedaten(route([leg('Etappe 1', punkte)]), [], [
    wp('Start', 50, 8),
    wp('Mitte', 50.5, 8), // genau auf der Strecke
    wp('Drittel', 50.25, 8.005), // rund 350 m daneben
    wp('Weit weg', 50.75, 9), // rund 70 km daneben
    wp('Ziel', 51, 8),
  ]);

  const namen = daten?.stationen.map((s) => s.name) ?? [];
  pruefe(
    'ein Wegpunkt auf der Strecke wird eine Station',
    namen.includes('Mitte') && namen.includes('Drittel'),
    `(${namen.join(', ')})`,
  );
  pruefe('ein Wegpunkt weit abseits wird keine', !namen.includes('Weit weg'));
  pruefe(
    'die Stationen stehen in der Reihenfolge der Strecke',
    (daten?.stationen ?? []).every((s, i, alle) => i === 0 || alle[i - 1]!.anteil <= s.anteil),
  );
  pruefe(
    'Start und Ziel stehen nur einmal da',
    namen.filter((n) => n === 'Start' || n === 'Ziel').length === 2 && namen.length === 4,
    `(${namen.length} Stationen)`,
  );
  pruefe(
    'nur das Ende einer Teilroute gilt als Etappenziel',
    (daten?.stationen ?? []).filter((s) => s.etappenziel).length === 1,
  );
  const mitte = daten?.stationen.find((s) => s.name === 'Mitte');
  pruefe(
    'der Streckenanteil stimmt',
    !!mitte && Math.abs(mitte.anteil - 0.5) < 0.01,
    `(${mitte?.anteil.toFixed(3)})`,
  );
}

// --- Leere Teilroute verschiebt nichts -----------------------------------
{
  const ersteHaelfte = punkte.slice(0, 101);
  const zweiteHaelfte = punkte.slice(100);
  const daten = baueReisedaten(
    route([leg('A', ersteHaelfte), leg('leer', []), leg('C', zweiteHaelfte)]),
    [],
    [],
  );
  // `grenzen` wird ueber den Index der Teilroute gelesen. Fehlte der Eintrag
  // der leeren, truege die vorletzte Etappe deren Titel und die letzte fiele
  // heraus -- samt ihrer Station und deren Schild.
  pruefe(
    'eine leere Teilroute verschiebt die Etappen nicht',
    JSON.stringify(daten?.etappen.map((e) => e.titel)) === JSON.stringify(['A', 'C']),
    `(${daten?.etappen.map((e) => e.titel).join(', ')})`,
  );
  pruefe(
    'die Stationen sitzen an der Haelfte und am Ende',
    Math.abs((daten?.stationen[1]?.anteil ?? 0) - 0.5) < 0.01 &&
      (daten?.stationen.at(-1)?.anteil ?? 0) === 1,
    `(${daten?.stationen.map((s) => s.anteil.toFixed(2)).join(', ')})`,
  );
}

console.log(fehler === 0 ? '\nALLE PRUEFUNGEN BESTANDEN' : `\n${fehler} FEHLGESCHLAGEN`);
process.exit(fehler === 0 ? 0 : 1);
