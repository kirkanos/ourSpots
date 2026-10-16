/**
 * Baut aus Route, Etappen und Wegpunkten das Modell, das die Animation
 * braucht: einen durchgehenden Track, die Etappen als Abschnitte darauf und
 * die Stationen mit ihren Namen.
 */
import { decodePolyline, type StageDto, type TripRouteDto, type WaypointDto } from '@ourspots/shared';
import { anteilNahe, baueTrack, entfernung, type Punkt, type Track } from './track';
import type { Etappe, Station } from './timeline';

export interface Reisedaten {
  track: Track;
  etappen: Etappe[];
  stationen: Station[];
}

/** Bis zu dieser Entfernung gilt ein Wegpunkt als der Ort, an dem eine Etappe endet. */
const NAHE_GENUG_M = 2000;

/**
 * Zwei Stationen, die enger beieinander liegen, sind dieselbe.
 *
 * Ein Rastort und der Wegpunkt, der ihn meint, stehen selten auf demselben
 * Meter. Ohne diese Grenze stuenden dort zwei Schilder uebereinander.
 */
const DIESELBE_STATION_M = 500;

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
    { name: nameFuer(punkte[0]!, 'Start'), ort: punkte[0]!, anteil: 0, etappenziel: false },
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
    stationen.push({
      name: nameFuer(ort, leg.stageTitle ?? `Ziel ${i + 1}`),
      ort,
      anteil: bis,
      etappenziel: true,
    });

    vonIndex = bisIndex;
  });

  if (etappen.length === 0) return null;

  // Rundungen beim Aufsummieren duerfen nicht dazu fuehren, dass die letzte
  // Etappe kurz vor dem Ende haengen bleibt.
  etappen[etappen.length - 1]!.bis = 1;
  stationen[stationen.length - 1]!.anteil = 1;

  ergaenzeZwischenstationen(track, stationen, wegpunkte);

  return { track, etappen, stationen };
}

/**
 * Macht jeden Wegpunkt, der auf der Strecke liegt, zu einer eigenen Station.
 *
 * Ohne das traegt nur das Ende einer Teilroute einen Namen, und genau dort
 * entstehen die Schilder. Eine Reise ohne Etappen haette dann ein einziges
 * Schild, ganz am Schluss -- und jeder Wegpunkt, der im Reiseplaner auf "ohne
 * Etappe" steht, bliebe stumm. Als Station kann er beides bekommen: ein Schild
 * und, wenn gewuenscht, einen Halt.
 *
 * Die Liste bleibt nach Streckenanteil sortiert. Sie ist die Reihenfolge, in
 * der die Oberflaeche ihre Regler zeigt und in der Halt, Foto und Schild je
 * Station abgelegt sind.
 */
function ergaenzeZwischenstationen(
  track: Track,
  stationen: Station[],
  wegpunkte: WaypointDto[],
): void {
  for (const wp of wegpunkte) {
    const { anteil, abstandM, index } = anteilNahe(track, [wp.lon, wp.lat]);
    // Ein Wegpunkt, den die Route gar nicht beruehrt, bekommt nichts: Das
    // Schild stuende sonst irgendwo im Gelaende neben der Strecke.
    if (abstandM > NAHE_GENUG_M) continue;

    const schonDa = stationen.some(
      (s) => entfernung(s.ort, [wp.lon, wp.lat]) < DIESELBE_STATION_M,
    );
    if (schonDa) continue;

    stationen.push({
      name: wp.name,
      // Der Ort auf der Strecke, nicht der des Wegpunkts: Das Schild soll am
      // Weg stehen, auch wenn der Stellplatz 300 m abseits liegt.
      ort: track.punkte[index]!,
      anteil,
      etappenziel: false,
    });
  }

  stationen.sort((a, b) => a.anteil - b.anteil);
}
