/**
 * Das Animationsmodell: eine reine Funktion "Zustand zum Zeitpunkt t".
 *
 * Vorschau und ein spaeteres serverseitiges Rendern treiben dieselbe Funktion
 * an -- die Vorschau mit der Uhr, der Renderer Bild fuer Bild. Nur so kann die
 * Vorschau nicht etwas zeigen, was im fertigen Video fehlt.
 *
 * Kern ist eine monoton steigende Abbildung Videozeit -> Streckenanteil. Ein
 * Halt ist darin schlicht ein Plateau: Die Zeit laeuft weiter, der
 * Streckenanteil bleibt stehen. Dadurch braucht keine andere Stelle einen
 * Sonderfall fuer Pausen, und die beiden Skalen koennen nicht auseinander
 * laufen.
 */
import { huelle, kursBei, ortBei, type Punkt, type Track } from './track';
import {
  anteilNachFahrzeit,
  baueKamerakurve,
  baueTempoprofil,
  fahrzeitBis,
  kameraBei,
  type Kamerakurve,
  type Kamerapunkt,
  type Tempoprofil,
} from './kamerakurve';

export type { Kamerapunkt } from './kamerakurve';

export interface Etappe {
  /** Titel der Etappe bzw. Name des Ziels. */
  titel: string;
  /** Streckenanteil, an dem die Etappe beginnt und endet (0..1). */
  von: number;
  bis: number;
  distanzM: number;
}

export interface Station {
  name: string;
  ort: Punkt;
  /** Streckenanteil, an dem die Station liegt. */
  anteil: number;
}

export interface Einstellungen {
  /** Sekunden Video je 100 km bei Tempo 1. */
  sekundenProHundertKm: number;
  /** Haltezeit an einer Station, in Sekunden. */
  haltSekunden: number;
  vorspannSekunden: number;
  abspannSekunden: number;
  /**
   * Zoomstufe waehrend der Fahrt -- die Flughoehe der Kamera. Gilt ueber die
   * ganze Reise, solange keine Kamerapunkte gesetzt sind.
   */
  fahrtZoom: number;
  /** Zoomstufe beim Halt. Ein absoluter Wert, kein Zuschlag. */
  haltZoom: number;
  /**
   * Neigung der Kamera in Grad. 0 blickt senkrecht nach unten, groessere Werte
   * legen die Kamera flacher und zeigen mehr Gelaende bis zum Horizont.
   * Ebenfalls nur die Grundeinstellung.
   */
  neigung: number;
  /**
   * Kamerafahrt: Hoehe und Neigung an einzelnen Stellen der Strecke, dazwischen
   * weich ueberblendet. Leer heisst "ueberall die Grundeinstellung".
   */
  kameraPunkte: Kamerapunkt[];
  /** Dreht die Karte in Fahrtrichtung. */
  kameraDrehtMit: boolean;
}

export const VORGABE: Einstellungen = {
  sekundenProHundertKm: 6,
  haltSekunden: 2.5,
  vorspannSekunden: 2,
  abspannSekunden: 3,
  fahrtZoom: 8.5,
  haltZoom: 10.5,
  neigung: 50,
  kameraDrehtMit: false,
  kameraPunkte: [],
};

type Abschnitt =
  | { art: 'vorspann'; dauer: number; anteil: number }
  | { art: 'fahrt'; dauer: number; von: number; bis: number; etappe: number }
  | { art: 'halt'; dauer: number; anteil: number; station: number }
  | { art: 'abspann'; dauer: number; anteil: number };

export interface Zeitachse {
  abschnitte: Abschnitt[];
  gesamtdauer: number;
  /** Ausschnitt fuer Vor- und Abspann. */
  gesamthuelle: [number, number, number, number];
  /**
   * Vorbereiteter Verlauf von Kamera und Tempo. Hier und nicht erst bei der
   * Auswertung, weil `zustandBei` je Bild einmal laeuft -- die Steigungen der
   * Kurve jedes Mal neu zu berechnen waere reine Verschwendung.
   */
  kamera: Kamerakurve;
  /** Dasselbe fuer die aufsummierte Fahrzeit. */
  tempo: Tempoprofil;
}

export function baueZeitachse(
  track: Track,
  etappen: Etappe[],
  stationen: Station[],
  e: Einstellungen,
): Zeitachse {
  const kamera = baueKamerakurve(e.kameraPunkte, e.fahrtZoom, e.neigung);
  const tempo = baueTempoprofil(kamera);

  // Was eine Fahrzeit-Einheit des Profils in Sekunden bedeutet. Ohne gesetzte
  // Tempopunkte ist das Profil die Gerade von 0 bis 1, und die Rechnung
  // ergibt genau die alte: Streckenlaenge mal Sekunden je 100 km.
  const sekundenJeEinheit = (track.laengeM / 100_000) * e.sekundenProHundertKm;

  const abschnitte: Abschnitt[] = [];

  abschnitte.push({ art: 'vorspann', dauer: e.vorspannSekunden, anteil: 0 });

  etappen.forEach((etappe, i) => {
    // Das Tempo wirkt auf die Dauer, nicht auf die Strecke. Es steht nicht
    // mehr je Etappe fest, sondern laeuft entlang der Reise -- die Dauer eines
    // Abschnitts ist deshalb die Differenz der aufsummierten Fahrzeit an
    // seinen Enden, nicht Distanz geteilt durch einen Faktor.
    const sekunden =
      (fahrzeitBis(tempo, etappe.bis) - fahrzeitBis(tempo, etappe.von)) * sekundenJeEinheit;
    abschnitte.push({
      art: 'fahrt',
      dauer: Math.max(0.2, sekunden),
      von: etappe.von,
      bis: etappe.bis,
      etappe: i,
    });

    // Nach jeder Etappe der Halt an ihrem Ziel.
    const station = stationen.findIndex((s) => Math.abs(s.anteil - etappe.bis) < 1e-9);
    abschnitte.push({
      art: 'halt',
      dauer: e.haltSekunden,
      anteil: etappe.bis,
      station: station >= 0 ? station : Math.min(i + 1, stationen.length - 1),
    });
  });

  abschnitte.push({ art: 'abspann', dauer: e.abspannSekunden, anteil: 1 });

  return {
    abschnitte,
    gesamtdauer: abschnitte.reduce((s, a) => s + a.dauer, 0),
    gesamthuelle: huelle(track.punkte),
    kamera,
    tempo,
  };
}

export interface Zustand {
  art: Abschnitt['art'];
  /** Position auf der Strecke, 0..1 – bei einem Halt konstant. */
  streckenAnteil: number;
  ort: Punkt;
  kurs: number;
  zoom: number;
  neigung: number;
  /** 0 = Uebersicht ueber die ganze Reise, 1 = dicht am Fahrzeug. */
  naehe: number;
  etappenIndex: number;
  gefahreneM: number;
  /** Welches Schild gerade zu sehen ist und wie stark (0..1). */
  schild: { station: number; staerke: number } | null;
}

/** Zustand zum Zeitpunkt t (Sekunden seit Videobeginn). */
export function zustandBei(
  zeitachse: Zeitachse,
  track: Track,
  e: Einstellungen,
  t: number,
): Zustand {
  const zeit = Math.min(Math.max(t, 0), zeitachse.gesamtdauer);

  let start = 0;
  let aktiv: Abschnitt = zeitachse.abschnitte[0]!;
  let index = 0;
  for (let i = 0; i < zeitachse.abschnitte.length; i++) {
    const a = zeitachse.abschnitte[i]!;
    if (zeit <= start + a.dauer || i === zeitachse.abschnitte.length - 1) {
      aktiv = a;
      index = i;
      break;
    }
    start += a.dauer;
  }
  const lokal = aktiv.dauer > 0 ? (zeit - start) / aktiv.dauer : 1;

  let anteil: number;
  let naehe: number;
  let etappenIndex = 0;

  switch (aktiv.art) {
    case 'vorspann':
      anteil = aktiv.anteil;
      // Aus der Uebersicht ans Fahrzeug heranfahren.
      naehe = weich(lokal);
      break;
    case 'fahrt': {
      // Nicht linear zwischen von und bis: Innerhalb eines Abschnitts darf
      // das Tempo wechseln. Gleichmaessig verteilt wird deshalb die Fahrzeit,
      // und daraus folgt rueckwaerts der Ort.
      const vonZeit = fahrzeitBis(zeitachse.tempo, aktiv.von);
      const bisZeit = fahrzeitBis(zeitachse.tempo, aktiv.bis);
      anteil = anteilNachFahrzeit(zeitachse.tempo, vonZeit + (bisZeit - vonZeit) * lokal);
      naehe = 1;
      etappenIndex = aktiv.etappe;
      break;
    }
    case 'halt':
      anteil = aktiv.anteil; // Plateau: die Zeit laeuft, die Strecke nicht.
      naehe = 1;
      break;
    case 'abspann':
      anteil = aktiv.anteil;
      // Wieder herauszoomen auf die ganze Reise.
      naehe = 1 - weich(lokal);
      break;
  }

  // Hoehe und Neigung kommen aus der Kamerafahrt. Ohne gesetzte Punkte sind
  // das schlicht die Grundwerte.
  const kamera = kameraBei(zeitachse.kamera, anteil);

  // Beim Halt kurz naeher heran und wieder zurueck. haltZoom ist dabei ein
  // absoluter Wert: Auf dem Hoehepunkt des Halts steht die Kamera genau dort,
  // unabhaengig davon, wie hoch sie auf der Strecke gerade flog.
  const haltNaehe = aktiv.art === 'halt' ? Math.sin(Math.PI * lokal) : 0;
  const zoom = kamera.zoom + (e.haltZoom - kamera.zoom) * haltNaehe;

  return {
    art: aktiv.art,
    streckenAnteil: anteil,
    ort: ortBei(track, anteil),
    // Immer berechnet: Die Kamera folgt ihm nur auf Wunsch, der Marker
    // braucht ihn aber auch sonst, um in Fahrtrichtung zu zeigen.
    kurs: kursBei(track, anteil),
    zoom,
    // In der Uebersicht senkrecht von oben, beim Fahren geneigt -- die
    // Ueberblendung uebernimmt `naehe` an der Aufrufstelle.
    neigung: kamera.neigung,
    naehe,
    etappenIndex,
    gefahreneM: anteil * track.laengeM,
    schild: schildBei(zeitachse, index, lokal),
  };
}

/**
 * Umkehrung: Wann ist das Video an dieser Stelle der Strecke?
 *
 * Braucht die Oberflaeche, um zu einem Kamerapunkt zu springen. Eindeutig ist
 * das nur waehrend der Fahrt -- an einem Halt steht die Strecke still, dort
 * wird der Beginn des Halts geliefert.
 */
export function zeitFuerAnteil(zeitachse: Zeitachse, anteil: number): number {
  let start = 0;
  for (const a of zeitachse.abschnitte) {
    if (a.art === 'fahrt' && anteil >= a.von && anteil <= a.bis) {
      // Ueber die Fahrzeit, nicht ueber die Strecke -- aus demselben Grund
      // wie in `zustandBei`.
      const vonZeit = fahrzeitBis(zeitachse.tempo, a.von);
      const bisZeit = fahrzeitBis(zeitachse.tempo, a.bis);
      const spanne = bisZeit - vonZeit;
      const hier = fahrzeitBis(zeitachse.tempo, anteil);
      return start + (spanne > 0 ? ((hier - vonZeit) / spanne) * a.dauer : 0);
    }
    if (a.art === 'halt' && Math.abs(a.anteil - anteil) < 1e-9) return start;
    start += a.dauer;
  }
  return Math.min(Math.max(anteil, 0), 1) * zeitachse.gesamtdauer;
}

/**
 * Das Schild einer Station wird kurz vor dem Halt eingeblendet und kurz danach
 * wieder weggenommen – sonst erscheint es hart im Bild.
 */
function schildBei(
  zeitachse: Zeitachse,
  index: number,
  lokal: number,
): { station: number; staerke: number } | null {
  const aktiv = zeitachse.abschnitte[index]!;

  if (aktiv.art === 'halt') return { station: aktiv.station, staerke: 1 };

  if (aktiv.art === 'fahrt') {
    // Letztes Fuenftel der Fahrt: das Schild des naechsten Ziels faehrt hoch.
    const naechster = zeitachse.abschnitte[index + 1];
    if (naechster?.art === 'halt' && lokal > 0.8) {
      return { station: naechster.station, staerke: weich((lokal - 0.8) / 0.2) };
    }
  }

  const voriger = zeitachse.abschnitte[index - 1];
  if (voriger?.art === 'halt' && lokal < 0.25 && aktiv.art !== 'vorspann') {
    return { station: voriger.station, staerke: weich(1 - lokal / 0.25) };
  }

  return null;
}

/** Weiche Kurve statt linearem Verlauf, damit Bewegungen nicht ruckartig einsetzen. */
function weich(x: number): number {
  const k = Math.min(Math.max(x, 0), 1);
  return k * k * (3 - 2 * k);
}
