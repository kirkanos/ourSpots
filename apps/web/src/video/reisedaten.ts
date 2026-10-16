/**
 * Baut aus Route, Etappen und Wegpunkten das Modell, das die Animation
 * braucht: einen durchgehenden Track, die Etappen als Abschnitte darauf und
 * die Stationen mit ihren Namen.
 */
import { decodePolyline, type StageDto, type TripRouteDto, type WaypointDto } from '@ourspots/shared';
import { baueTrack, entfernung, type Punkt, type Track } from './track';
import type { Etappe, Station } from './timeline';

export interface Reisedaten {
  track: Track;
  etappen: Etappe[];
  stationen: Station[];
}

/** Bis zu dieser Entfernung gilt ein Wegpunkt als der Ort, an dem eine Etappe endet. */
const NAHE_GENUG_M = 2000;

export function baueReisedaten(
  route: TripRouteDto,
  etappenDaten: StageDto[],
  wegpunkte: WaypointDto[],
): Reisedaten | null {
  // Die Teilrouten haengen aneinander: Jede beginnt dort, wo die vorige endete.
  // Beim Zusammensetzen faellt der doppelte Punkt weg.
  const punkte: Punkt[] = [];
  const grenzen: number[] = [];

  for (const leg of route.legs) {
    const teil = decodePolyline(leg.geometry).map(([lat, lon]) => [lon, lat] as Punkt);
    // Auch eine leere Teilroute bekommt ihren Eintrag: `grenzen` wird weiter
    // unten ueber den Index der Teilroute gelesen. Ein uebersprungener Eintrag
    // wuerde alle folgenden um eins verschieben -- dann saessen Etappengrenzen
    // und Stationen an falschen Stellen, und die letzte Etappe fiele ganz weg.
    // Der hier eingetragene Wert ist das bisherige Ende; die Etappe faellt
    // damit als leer durch die Pruefung "bisIndex <= vonIndex".
    if (teil.length > 0) punkte.push(...(punkte.length > 0 ? teil.slice(1) : teil));
    grenzen.push(punkte.length - 1);
  }

  if (punkte.length < 2) return null;
  const track = baueTrack(punkte);
  if (track.laengeM === 0) return null;

  const anteilVon = (index: number) => track.summe[index]! / track.laengeM;

  // Benannte Orte, an denen eine Etappe enden kann: zuerst die Rastorte der
  // Etappen, sonst die Wegpunkte.
  const benannt = [
    ...etappenDaten
      .filter((s) => s.lat !== null && s.lon !== null)
      .map((s) => ({ name: s.title ?? 'Etappe', ort: [s.lon!, s.lat!] as Punkt })),
    ...wegpunkte.map((w) => ({ name: w.name, ort: [w.lon, w.lat] as Punkt })),
  ];

  const nameFuer = (ort: Punkt, ersatz: string): string => {
    let bester = ersatz;
    let beste = NAHE_GENUG_M;
    for (const k of benannt) {
      const d = entfernung(ort, k.ort);
      if (d < beste) {
        beste = d;
        bester = k.name;
      }
    }
    return bester;
  };

  const stationen: Station[] = [
    { name: nameFuer(punkte[0]!, 'Start'), ort: punkte[0]!, anteil: 0 },
  ];
  const etappen: Etappe[] = [];
  let vonIndex = 0;

  route.legs.forEach((leg, i) => {
    const bisIndex = grenzen[i];
    if (bisIndex === undefined || bisIndex <= vonIndex) return;

    const von = anteilVon(vonIndex);
    const bis = anteilVon(bisIndex);
    const ort = punkte[bisIndex]!;

    etappen.push({
      titel: leg.stageTitle ?? `Etappe ${i + 1}`,
      von,
      bis,
      distanzM: leg.distanceM,
    });
    stationen.push({ name: nameFuer(ort, leg.stageTitle ?? `Ziel ${i + 1}`), ort, anteil: bis });

    vonIndex = bisIndex;
  });

  if (etappen.length === 0) return null;

  // Rundungen beim Aufsummieren duerfen nicht dazu fuehren, dass die letzte
  // Etappe kurz vor dem Ende haengen bleibt.
  etappen[etappen.length - 1]!.bis = 1;
  stationen[stationen.length - 1]!.anteil = 1;

  return { track, etappen, stationen };
}
