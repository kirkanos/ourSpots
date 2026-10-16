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
  /**
   * Ob hier eine Etappe endet.
   *
   * Nur fuer die Vorgaben: An einem Etappenziel haelt das Video von sich aus,
   * an einem Wegpunkt unterwegs faehrt es durch, bis jemand es anders
   * einstellt. Beides laesst sich je Station ueberschreiben.
   */
  etappenziel: boolean;
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
  /**
   * Dreht die Karte in Fahrtrichtung. Nur die Grundeinstellung -- gesetzte
   * Kamerapunkte bestimmen es danach stufenlos.
   */
  kameraDrehtMit: boolean;
  /**
   * Haltedauer je Station, in der Reihenfolge der Stationen. Fehlt ein
   * Eintrag, haelt das Video an einem Etappenziel `haltSekunden` lang und
   * faehrt an jeder anderen Station durch. Eine 0 faehrt ohne Halt durch.
   */
  haltProStation: number[];
  /**
   * Ob an dieser Station ein Schild steht, in der Reihenfolge der Stationen.
   * Fehlt ein Eintrag, steht ueberall eines ausser am Startpunkt -- dort
   * beginnt das Video, und die Titeltafel nennt den Ort ohnehin.
   *
   * Unabhaengig vom Halt: Ein Schild kann auch im Vorbeifahren erscheinen.
   */
  schildProStation: boolean[];
  /**
   * Foto je Station, in der Reihenfolge der Stationen. Null zeigt keines.
   * Ebenfalls nur Kennungen -- siehe Kamerapunkt.
   */
  fotoProStation: (string | null)[];
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
  haltProStation: [],
  schildProStation: [],
  fotoProStation: [],
  kameraPunkte: [],
};

type Abschnitt =
  | { art: 'vorspann'; dauer: number; anteil: number }
  | { art: 'fahrt'; dauer: number; von: number; bis: number; etappe: number }
  // station ist null, wenn an dieser Stelle keine Station liegt -- ein Halt,
  // den jemand frei auf die Strecke gesetzt hat. Dann erscheint auch kein
  // Schild.
  | {
      art: 'halt';
      dauer: number;
      anteil: number;
      station: number | null;
      /** Foto fuer diesen Halt, schon aufgeloest -- siehe sammleHalte. */
      foto: string | null;
    }
  | { art: 'abspann'; dauer: number; anteil: number };

/**
 * Eine Einblendung ueber der Karte: ein Schild, ein Foto oder beides.
 *
 * Bewusst in Sekunden und nicht an einen Abschnitt gehaengt. Frueher hing das
 * Schild am Halt -- "letztes Fuenftel der Fahrt davor, erstes Viertel danach".
 * Damit konnte nur etwas zeigen, wo das Video auch stehen blieb, und wie lange
 * es zu sehen war, haing am Tempo der Etappe. Als Zeitfenster gilt dieselbe
 * Regel fuer eine Station mit Halt und fuer eine, an der nur vorbeigefahren
 * wird.
 */
interface Einblendung {
  /** Station, zu der die Einblendung gehoert -- null bei einer freien Pause. */
  station: number | null;
  foto: string | null;
  /** Ob ein Schild erscheint. Ein Foto kann auch ohne Schild stehen. */
  schild: boolean;
  /** Beginn der Einblendung, volle Staerke von/bis, Ende der Ausblendung. */
  von: number;
  vollVon: number;
  vollBis: number;
  bis: number;
}

/** Wie lange ein Schild hoch- und wieder herunterfaehrt, in Sekunden. */
const EINBLENDEN = 1.2;
const AUSBLENDEN = 0.8;
/**
 * So lange steht ein Schild mindestens, auch wenn das Video nicht haelt --
 * sonst blitzt es im Scheitel nur kurz auf und ist nicht zu lesen.
 */
const MINDESTENS_VOLL = 0.8;

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
  /** Schilder und Fotos mit ihren Zeitfenstern, nach Beginn sortiert. */
  einblendungen: Einblendung[];
}

export function baueZeitachse(
  track: Track,
  etappen: Etappe[],
  stationen: Station[],
  e: Einstellungen,
): Zeitachse {
  const kamera = baueKamerakurve(
    e.kameraPunkte,
    e.fahrtZoom,
    e.neigung,
    e.kameraDrehtMit ? 1 : 0,
  );
  const tempo = baueTempoprofil(kamera);

  // Was eine Fahrzeit-Einheit des Profils in Sekunden bedeutet. Ohne gesetzte
  // Tempopunkte ist das Profil die Gerade von 0 bis 1, und die Rechnung
  // ergibt genau die alte: Streckenlaenge mal Sekunden je 100 km.
  const sekundenJeEinheit = (track.laengeM / 100_000) * e.sekundenProHundertKm;

  const abschnitte: Abschnitt[] = [];

  abschnitte.push({ art: 'vorspann', dauer: e.vorspannSekunden, anteil: 0 });

  // Gefahren wird von Halt zu Halt. Frueher fiel das zusammen -- ein Halt lag
  // immer am Ende einer Etappe --, seit Kamerapunkte eine eigene Pause tragen
  // duerfen aber nicht mehr. Deshalb erst alle Haltestellen einsammeln und die
  // Fahrt daran aufteilen, statt ueber die Etappen zu laufen.
  const halte = sammleHalte(stationen, e);

  let von = 0;
  for (const halt of [...halte, null]) {
    const bis = halt ? halt.anteil : 1;

    if (bis > von + 1e-9) {
      const sekunden = (fahrzeitBis(tempo, bis) - fahrzeitBis(tempo, von)) * sekundenJeEinheit;
      abschnitte.push({
        art: 'fahrt',
        // Nur gegen die glatte Null abgesichert, nicht gegen kurze Abschnitte.
        // Frueher stand hier 0.2, als ein Abschnitt immer eine ganze Etappe
        // war. Seit die Fahrt an jeder Pause geteilt wird, entstehen
        // zwangslaeufig kurze Stuecke -- eine Pause kurz vor einer Station
        // laesst ein Reststueck von wenigen hundert Metern uebrig. Mit der
        // alten Untergrenze waere daraus eine sichtbare Verzoegerung von zwei
        // Zehnteln geworden, und die Gesamtdauer haette nicht mehr zur Summe
        // aus Fahrzeit und Pausen gepasst.
        dauer: Math.max(0.001, sekunden),
        von,
        bis,
        // Fuer die Einblendung: die Etappe, in der dieser Abschnitt liegt.
        etappe: etappeBei(etappen, (von + bis) / 2),
      });
      von = bis;
    }

    if (halt && halt.dauer > 0) {
      abschnitte.push({
        art: 'halt',
        dauer: halt.dauer,
        anteil: halt.anteil,
        station: halt.station,
        foto: halt.foto,
      });
    }
  }

  abschnitte.push({ art: 'abspann', dauer: e.abspannSekunden, anteil: 1 });

  const zeitachse: Zeitachse = {
    abschnitte,
    gesamtdauer: abschnitte.reduce((s, a) => s + a.dauer, 0),
    gesamthuelle: huelle(track.punkte),
    kamera,
    tempo,
    einblendungen: [],
  };

  zeitachse.einblendungen = sammleEinblendungen(zeitachse, stationen, e);
  return zeitachse;
}

/**
 * Legt fest, wann welches Schild und welches Foto zu sehen ist.
 *
 * Zwei Quellen: die Halte, deren Zeitpunkt direkt in der Zeitachse steht, und
 * die Stationen ohne Halt -- an denen wird nur vorbeigefahren, ihr Zeitpunkt
 * muss aus der Strecke zurueckgerechnet werden.
 */
function sammleEinblendungen(
  zeitachse: Zeitachse,
  stationen: Station[],
  e: Einstellungen,
): Einblendung[] {
  const liste: Einblendung[] = [];
  const erledigt = new Set<number>();

  let zeit = 0;
  for (const a of zeitachse.abschnitte) {
    if (a.art === 'halt') {
      liste.push(baueEinblendung(a.station, a.foto, zeigtSchild(stationen, e, a.station), zeit, a.dauer));
      if (a.station !== null) erledigt.add(a.station);
    }
    zeit += a.dauer;
  }

  stationen.forEach((station, i) => {
    if (erledigt.has(i)) return;
    const schild = zeigtSchild(stationen, e, i);
    const foto = (e.fotoProStation ?? [])[i] ?? null;
    if (!schild && !foto) return;
    liste.push(baueEinblendung(i, foto, schild, zeitFuerAnteil(zeitachse, station.anteil), 0));
  });

  return liste.sort((a, b) => a.von - b.von);
}

/**
 * Ob an dieser Station ein Schild steht.
 *
 * Wie bei den Kamerapunkten kann das Feld in einem aelteren Rezept fehlen --
 * dann gilt die Vorgabe: ueberall eines ausser am Startpunkt.
 */
function zeigtSchild(stationen: Station[], e: Einstellungen, index: number | null): boolean {
  if (index === null) return false;
  const gesetzt = (e.schildProStation ?? [])[index];
  if (typeof gesetzt === 'boolean') return gesetzt;
  return (stationen[index]?.anteil ?? 0) > 0;
}

function baueEinblendung(
  station: number | null,
  foto: string | null,
  schild: boolean,
  zeit: number,
  haltDauer: number,
): Einblendung {
  const vollVon = zeit;
  const vollBis = zeit + Math.max(haltDauer, MINDESTENS_VOLL);
  return {
    station,
    foto,
    schild,
    // Nicht vor den Videoanfang: Bei einer Station gleich am Start waere das
    // sonst eine Einblendung mit negativem Beginn, und die Rechnung in
    // staerkeBei liefe ins Leere.
    von: Math.max(0, vollVon - EINBLENDEN),
    vollVon,
    vollBis,
    bis: vollBis + AUSBLENDEN,
  };
}

/** Wie stark diese Einblendung zum Zeitpunkt t zu sehen ist (0..1). */
function staerkeBei(ein: Einblendung, t: number): number {
  if (t <= ein.von || t >= ein.bis) return 0;
  if (t < ein.vollVon) return weich((t - ein.von) / Math.max(1e-6, ein.vollVon - ein.von));
  if (t <= ein.vollBis) return 1;
  return weich((ein.bis - t) / Math.max(1e-6, ein.bis - ein.vollBis));
}

export interface Zustand {
  art: Abschnitt['art'];
  /** Position auf der Strecke, 0..1 – bei einem Halt konstant. */
  streckenAnteil: number;
  ort: Punkt;
  kurs: number;
  zoom: number;
  neigung: number;
  /** Wie stark die Karte der Fahrtrichtung folgt: 0 Norden oben, 1 mitdrehen. */
  drehung: number;
  /** 0 = Uebersicht ueber die ganze Reise, 1 = dicht am Fahrzeug. */
  naehe: number;
  etappenIndex: number;
  gefahreneM: number;
  /**
   * Welche Schilder gerade zu sehen sind und wie stark (0..1).
   *
   * Mehrere, weil zwei Stationen dicht beieinander liegen koennen -- zwei
   * Wegpunkte im selben Ort etwa. Frueher war es eines, und das zweite fiel
   * dann stumm aus dem Bild.
   */
  schilder: Array<{ station: number; staerke: number }>;
  /** Welches Foto gerade zu sehen ist und wie stark (0..1). */
  foto: { id: string; staerke: number } | null;
  /**
   * Titel- oder Schlusstafel und wie stark sie zu sehen ist (0..1).
   *
   * Beide liegen in Vor- und Abspann, die es ohnehin gab -- sie bekommen also
   * keine eigene Zeit, sondern fuellen die, in der die Kamera bisher nur
   * heran- oder wegflog.
   */
  tafel: { art: 'titel' | 'schluss'; staerke: number } | null;
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
  for (let i = 0; i < zeitachse.abschnitte.length; i++) {
    const a = zeitachse.abschnitte[i]!;
    if (zeit <= start + a.dauer || i === zeitachse.abschnitte.length - 1) {
      aktiv = a;
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
    drehung: kamera.drehung,
    naehe,
    etappenIndex,
    gefahreneM: anteil * track.laengeM,
    schilder: schilderBei(zeitachse, zeit),
    foto: fotoBei(zeitachse, zeit),
    tafel: tafelBei(aktiv.art, lokal),
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
 * Die Schilder, die zum Zeitpunkt t zu sehen sind.
 *
 * Eine Station ohne Halt bekommt genauso ein Fenster wie eine mit -- siehe
 * sammleEinblendungen. Ob dort ueberhaupt eines steht, entscheidet
 * `schildProStation`.
 */
function schilderBei(
  zeitachse: Zeitachse,
  zeit: number,
): Array<{ station: number; staerke: number }> {
  const sichtbar: Array<{ station: number; staerke: number }> = [];
  for (const ein of zeitachse.einblendungen) {
    // Die Liste ist nach Beginn sortiert: Was spaeter anfaengt, ist noch
    // nicht dran.
    if (ein.von > zeit) break;
    if (!ein.schild || ein.station === null) continue;
    const staerke = staerkeBei(ein, zeit);
    if (staerke > 0) sichtbar.push({ station: ein.station, staerke });
  }
  return sichtbar;
}

/**
 * Titel- und Schlusstafel.
 *
 * Der Titel steht am Anfang und macht gegen Ende des Vorspanns Platz; die
 * Schlusstafel kommt zu Beginn des Abspanns und bleibt bis zuletzt stehen.
 * Beide blenden weich, damit sie nicht ins Bild springen.
 */
function tafelBei(
  art: Abschnitt['art'],
  lokal: number,
): { art: 'titel' | 'schluss'; staerke: number } | null {
  if (art === 'vorspann') {
    return { art: 'titel', staerke: lokal < 0.65 ? weich(lokal / 0.25) : weich((1 - lokal) / 0.35) };
  }
  if (art === 'abspann') {
    return { art: 'schluss', staerke: weich(lokal / 0.3) };
  }
  return null;
}

/**
 * Das Foto zum Zeitpunkt t, mit demselben Fenster wie das Schild.
 *
 * Bewusst an denselben Zeitpunkten: Schild und Bild gehoeren zusammen und
 * sollen nicht nacheinander auftauchen. Eines zur Zeit -- zwei Fotos
 * uebereinander waeren nicht zu erkennen --, und zwar das staerkste.
 */
function fotoBei(zeitachse: Zeitachse, zeit: number): { id: string; staerke: number } | null {
  let bestes: { id: string; staerke: number } | null = null;
  for (const ein of zeitachse.einblendungen) {
    if (ein.von > zeit) break;
    if (!ein.foto) continue;
    const staerke = staerkeBei(ein, zeit);
    if (staerke > 0 && (!bestes || staerke > bestes.staerke)) bestes = { id: ein.foto, staerke };
  }
  return bestes;
}

/** Weiche Kurve statt linearem Verlauf, damit Bewegungen nicht ruckartig einsetzen. */
function weich(x: number): number {
  const k = Math.min(Math.max(x, 0), 1);
  return k * k * (3 - 2 * k);
}

/**
 * Die Vorgaben fuer eine Station, wenn nichts eingestellt ist.
 *
 * Die Oberflaeche braucht dieselben Werte wie der Zeitachsenbau, sonst zeigt
 * sie einen Regler, der etwas anderes behauptet als das Video tut.
 */
export function vorgabeFuerStation(
  station: Station,
  e: Einstellungen,
): { halt: number; schild: boolean } {
  return {
    halt: station.etappenziel ? e.haltSekunden : 0,
    schild: station.anteil > 0,
  };
}

/** Eine Stelle, an der das Video stehen bleibt. */
interface Haltestelle {
  anteil: number;
  dauer: number;
  /** Index der Station, falls hier eine liegt -- sonst null. */
  station: number | null;
  /** Kennung des Fotos, das hier erscheint -- sonst null. */
  foto: string | null;
}

/**
 * Sammelt alle Halte der Reise ein: die an den Stationen und die, die jemand
 * frei auf einen Kamerapunkt gesetzt hat.
 *
 * Liegen zwei dicht beieinander, wird daraus einer. Sonst bekaeme man zwei
 * Pausen im Abstand weniger Meter, dazwischen eine Fahrt von Bruchteilen einer
 * Sekunde -- im Video ein Ruckeln ohne erkennbaren Grund.
 */
function sammleHalte(stationen: Station[], e: Einstellungen): Haltestelle[] {
  const roh: Haltestelle[] = [];

  // Wie bei den Kamerapunkten: Das Rezept eines Renderauftrags kommt als JSON
  // aus der Datenbank, und dort haelt kein Typ die Form fest. Ein Auftrag, der
  // vor diesen Feldern angelegt wurde, hat sie schlicht nicht.
  const haltProStation = e.haltProStation ?? [];
  const fotoProStation = e.fotoProStation ?? [];

  // Ueber die Stationen, nicht ueber die Etappen: Seit jeder Wegpunkt auf der
  // Strecke eine Station ist, soll auch an jedem gehalten werden koennen. Die
  // Vorgabe unterscheidet die beiden Faelle -- an einem Etappenziel haelt das
  // Video, an einem Wegpunkt unterwegs faehrt es durch.
  stationen.forEach((station, index) => {
    const dauer = haltProStation[index] ?? (station.etappenziel ? e.haltSekunden : 0);
    if (dauer <= 0) return;
    roh.push({ anteil: station.anteil, dauer, station: index, foto: fotoProStation[index] ?? null });
  });

  for (const punkt of e.kameraPunkte ?? []) {
    if (punkt.halt > 0) {
      roh.push({
        anteil: punkt.anteil,
        dauer: punkt.halt,
        station: null,
        foto: punkt.foto ?? null,
      });
    }
  }

  roh.sort((a, b) => a.anteil - b.anteil);

  const halte: Haltestelle[] = [];
  for (const h of roh) {
    const vorher = halte[halte.length - 1];
    if (vorher && Math.abs(h.anteil - vorher.anteil) < 1e-6) {
      // Zusammenlegen: die laengere Pause gewinnt, die Station bleibt erhalten.
      vorher.dauer = Math.max(vorher.dauer, h.dauer);
      vorher.station = vorher.station ?? h.station;
      vorher.foto = vorher.foto ?? h.foto;
    } else {
      halte.push({ ...h });
    }
  }
  return halte;
}

/** In welcher Etappe liegt dieser Streckenanteil? */
function etappeBei(etappen: Etappe[], anteil: number): number {
  const i = etappen.findIndex((e) => anteil >= e.von && anteil <= e.bis);
  return i >= 0 ? i : Math.max(0, etappen.length - 1);
}
