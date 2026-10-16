/**
 * Der Verlauf von Kamera und Tempo entlang der Strecke.
 *
 * Gesetzt werden einzelne Punkte -- "hier soll die Kamera tiefer stehen", "ab
 * den Alpen langsamer fahren" --, dazwischen rechnet diese Datei. Zwei
 * Festlegungen stecken darin, und beide haben einen Grund.
 *
 * **Die Punkte haengen an der Strecke, nicht an der Videozeit.** Wer das Tempo
 * einer Etappe aendert oder die Sekunden je 100 km verstellt, verschiebt damit
 * die ganze Zeitachse. Haengten die Kamerapunkte an Sekunden, wanderten sie bei
 * jeder solchen Aenderung ueber die Landschaft. An einem Streckenanteil
 * festgemacht bleiben sie, wo der Nutzer sie hingesetzt hat.
 *
 * **Zwischen den Punkten liegt eine monotone kubische Kurve** (Fritsch-Carlson),
 * keine Gerade und kein Catmull-Rom. Eine Gerade trifft die Punkte zwar, aber
 * die Kamera wechselt dort schlagartig ihre Geschwindigkeit -- im Video sieht
 * man an jedem Punkt einen Knick. Catmull-Rom laeuft weich hindurch, schiesst
 * aber ueber die gesetzten Werte hinaus: Wer zwischen zwei Punkten 8 und 10
 * setzt, bekaeme zwischendurch 10,4 zu sehen. Bei einer Hoehe, die jemand
 * bewusst eingestellt hat, ist das schlicht falsch. Die monotone Variante hat
 * beides: stetige Geschwindigkeit und kein Ueberschwingen.
 */

export interface Kamerapunkt {
  /** Position auf der Strecke, 0..1. */
  anteil: number;
  /** Zoomstufe – die Flughoehe der Kamera. */
  zoom: number;
  /** Neigung der Kamera in Grad. */
  neigung: number;
  /** Tempofaktor: 1 = normal, 2 = doppelt so schnell, 0.5 = halb so schnell. */
  tempo: number;
  /**
   * Wie stark die Kamera der Fahrtrichtung folgt: 0 haelt Norden oben,
   * 1 dreht die Karte mit dem Fahrzeug.
   *
   * Bewusst ein Anteil und keine Gradzahl. Eine absolute Blickrichtung muesste
   * bei 359 Grad nach 1 Grad ueber die Null laufen, und das kann eine Kurve
   * nicht -- sie naehme den langen Weg zurueck ueber 180 Grad. Der Anteil hat
   * das Problem nicht und trifft die beiden Faelle, um die es geht: an der
   * Kueste mitdrehen, im Landesinneren Norden oben lassen.
   */
  drehung: number;
  /**
   * Pause an dieser Stelle, in Sekunden. 0 heisst durchfahren.
   *
   * Nicht Teil der Kurve, sondern ein Ereignis: Dazwischen wird nichts
   * ueberblendet, die Zeit steht schlicht still. Siehe timeline.ts.
   */
  halt: number;
  /**
   * Foto, das waehrend der Pause erscheint -- null blendet keines ein.
   *
   * Nur eine Kennung, kein Bild: Die Szene schlaegt sie nach. So bleibt diese
   * Datei frei von allem, was mit Laden und Darstellen zu tun hat.
   */
  foto: string | null;
}

/** Ein vorbereiteter Kanal: Stuetzstellen, Werte und die Steigungen dazu. */
interface Kanal {
  x: number[];
  y: number[];
  /** Steigung an jeder Stuetzstelle, einmal im Voraus berechnet. */
  m: number[];
}

export interface Kamerakurve {
  zoom: Kanal;
  neigung: Kanal;
  tempo: Kanal;
  drehung: Kanal;
}

/**
 * Bereitet die Kurve vor.
 *
 * Ohne gesetzte Punkte bleibt es bei den Grundwerten ueber die ganze Reise --
 * dann verhaelt sich alles wie vor der Einfuehrung der Kamerapunkte.
 */
export function baueKamerakurve(
  punkte: Kamerapunkt[],
  grundZoom: number,
  grundNeigung: number,
  grundDrehung = 0,
): Kamerakurve {
  // Die Pruefung auf undefined ist kein Misstrauen gegen den Aufrufer: Das
  // Rezept eines Renderauftrags kommt als JSON aus der Datenbank, und dort
  // haelt kein Typ die Form fest. Ein Auftrag, der vor dieser Funktion
  // angelegt wurde, hat das Feld schlicht nicht -- dann gilt die
  // Grundeinstellung, statt dass der ganze Lauf an einer Kleinigkeit scheitert.
  if (!punkte || punkte.length === 0) {
    return {
      zoom: konstant(grundZoom),
      neigung: konstant(grundNeigung),
      // Ohne Punkte faehrt die ganze Reise im Grundtempo; wie schnell das ist,
      // sagt `sekundenProHundertKm`.
      tempo: konstant(1),
      drehung: konstant(grundDrehung),
    };
  }

  // Sortiert und ohne Dubletten: Zwei Punkte an derselben Stelle ergaeben eine
  // Division durch null, und die Reihenfolge darf nicht von der Eingabe
  // abhaengen.
  const sortiert = [...punkte].sort((a, b) => a.anteil - b.anteil);
  const sauber: Kamerapunkt[] = [];
  for (const p of sortiert) {
    const vorher = sauber[sauber.length - 1];
    if (vorher && Math.abs(p.anteil - vorher.anteil) < 1e-6) {
      sauber[sauber.length - 1] = p;
    } else {
      sauber.push(p);
    }
  }

  const x = sauber.map((p) => p.anteil);
  return {
    zoom: baueKanal(x, sauber.map((p) => p.zoom)),
    neigung: baueKanal(x, sauber.map((p) => p.neigung)),
    tempo: baueKanal(x, sauber.map((p) => p.tempo)),
    drehung: baueKanal(x, sauber.map((p) => p.drehung)),
  };
}

/** Hoehe, Neigung und Tempo an einer Stelle der Strecke. */
export function kameraBei(kurve: Kamerakurve, anteil: number): {
  zoom: number;
  neigung: number;
  tempo: number;
  drehung: number;
} {
  return {
    zoom: werteAus(kurve.zoom, anteil),
    neigung: werteAus(kurve.neigung, anteil),
    // Die Kurve kann zwischen zwei Punkten nicht ueber deren Werte
    // hinausschiessen, aber ausserhalb gesetzter Punkte wird gehalten --
    // begrenzt wird trotzdem, damit kein Rundungsrest herausfaellt.
    drehung: Math.min(Math.max(werteAus(kurve.drehung, anteil), 0), 1),
    // Nach unten abgefangen: Ein Tempo von null brauchte unendlich lange, und
    // die Kurve kann zwischen zwei gesetzten Punkten zwar nicht unter deren
    // Minimum fallen, aber sicher ist sicher.
    tempo: Math.max(0.05, werteAus(kurve.tempo, anteil)),
  };
}

function konstant(wert: number): Kanal {
  return { x: [0], y: [wert], m: [0] };
}

/**
 * Berechnet die Steigungen nach Fritsch-Carlson.
 *
 * Der Kern steckt in zwei Zeilen: Wechselt die Richtung an einer Stuetzstelle
 * das Vorzeichen, wird die Steigung dort null -- genau das verhindert das
 * Ueberschwingen an Hoch- und Tiefpunkten. Sonst wird ein gewichtetes
 * harmonisches Mittel der Nachbarsteigungen genommen, das von sich aus nie
 * mehr als das Dreifache der kleineren Nachbarsteigung ergibt.
 */
function baueKanal(x: number[], y: number[]): Kanal {
  const n = x.length;
  if (n === 1) return { x, y, m: [0] };

  const h: number[] = [];
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(x[i + 1]! - x[i]!);
    d.push((y[i + 1]! - y[i]!) / (x[i + 1]! - x[i]!));
  }

  const m: number[] = new Array(n).fill(0);
  m[0] = d[0]!;
  m[n - 1] = d[n - 2]!;

  for (let i = 1; i < n - 1; i++) {
    const links = d[i - 1]!;
    const rechts = d[i]!;
    if (links * rechts <= 0) {
      m[i] = 0;
      continue;
    }
    const w1 = 2 * h[i]! + h[i - 1]!;
    const w2 = h[i]! + 2 * h[i - 1]!;
    m[i] = (w1 + w2) / (w1 / links + w2 / rechts);
  }

  return { x, y, m };
}

/** Hermite-Auswertung im passenden Abschnitt. */
function werteAus(kanal: Kanal, stelle: number): number {
  const { x, y, m } = kanal;
  const n = x.length;

  // Ausserhalb der gesetzten Punkte wird gehalten, nicht extrapoliert: Eine
  // fortgesetzte Steigung liesse die Kamera vor dem ersten und nach dem
  // letzten Punkt in Hoehen laufen, die niemand eingestellt hat.
  if (n === 1 || stelle <= x[0]!) return y[0]!;
  if (stelle >= x[n - 1]!) return y[n - 1]!;

  let i = 0;
  while (i < n - 2 && stelle > x[i + 1]!) i++;

  const h = x[i + 1]! - x[i]!;
  const t = (stelle - x[i]!) / h;
  const t2 = t * t;
  const t3 = t2 * t;

  // Hermite-Basis.
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  return h00 * y[i]! + h10 * h * m[i]! + h01 * y[i + 1]! + h11 * h * m[i + 1]!;
}

// ---------------------------------------------------------------------------
// Tempoprofil
// ---------------------------------------------------------------------------

/**
 * Wie lange die Fahrt bis zu jeder Stelle der Strecke dauert.
 *
 * Mit festem Tempo waere das eine Gerade -- halbe Strecke, halbe Zeit. Sobald
 * das Tempo unterwegs wechselt, stimmt das nicht mehr: Fuer ein langsames
 * Stueck braucht man laenger, obwohl es gleich lang ist. Die Fahrzeit ist dann
 * das Integral ueber den Kehrwert des Tempos, und die gibt es nicht als
 * geschlossene Formel -- die Tempokurve ist stueckweise kubisch.
 *
 * Deshalb einmal numerisch aufsummiert und als Tabelle behalten. Daraus
 * lassen sich beide Richtungen bedienen: "wie lange bis hierhin" fuer den
 * Aufbau der Zeitachse, und "wo bin ich nach dieser Zeit" fuer jedes einzelne
 * Bild.
 *
 * Die Werte sind einheitenlos. Was eine Einheit in Sekunden bedeutet, legt
 * erst `sekundenProHundertKm` zusammen mit der Streckenlaenge fest.
 */
export interface Tempoprofil {
  /** summe[i] gehoert zum Streckenanteil i / (summe.length - 1). */
  summe: number[];
}

/**
 * 2048 Stuetzstellen: Bei einer Reise von 2000 km ist das etwa ein Wert je
 * Kilometer. Zwischen zwei davon aendert sich ein weich verlaufendes Tempo so
 * wenig, dass die lineare Naeherung nicht auffaellt.
 */
const STUFEN = 2048;

export function baueTempoprofil(kurve: Kamerakurve, stufen = STUFEN): Tempoprofil {
  const h = 1 / stufen;
  const summe: number[] = new Array(stufen + 1);
  summe[0] = 0;

  let vorher = 1 / Math.max(0.05, werteAus(kurve.tempo, 0));
  for (let i = 1; i <= stufen; i++) {
    const jetzt = 1 / Math.max(0.05, werteAus(kurve.tempo, i * h));
    // Trapezregel: genauer als die Rechteckregel und hier praktisch gratis.
    summe[i] = summe[i - 1]! + ((vorher + jetzt) / 2) * h;
    vorher = jetzt;
  }

  return { summe };
}

/** Fahrzeit-Einheiten vom Start bis zu dieser Stelle. */
export function fahrzeitBis(profil: Tempoprofil, anteil: number): number {
  const { summe } = profil;
  const n = summe.length - 1;
  const x = Math.min(Math.max(anteil, 0), 1) * n;
  const i = Math.min(Math.floor(x), n - 1);
  const rest = x - i;
  return summe[i]! + (summe[i + 1]! - summe[i]!) * rest;
}

/** Die Umkehrung: Wo liegt man nach so vielen Fahrzeit-Einheiten? */
export function anteilNachFahrzeit(profil: Tempoprofil, zeit: number): number {
  const { summe } = profil;
  const n = summe.length - 1;
  if (zeit <= 0) return 0;
  if (zeit >= summe[n]!) return 1;

  // Die Summe steigt streng monoton -- das Tempo ist immer positiv --, also
  // laesst sich binaer suchen.
  let tief = 0;
  let hoch = n;
  while (hoch - tief > 1) {
    const mitte = (tief + hoch) >> 1;
    if (summe[mitte]! <= zeit) tief = mitte;
    else hoch = mitte;
  }

  const spanne = summe[hoch]! - summe[tief]!;
  const rest = spanne > 0 ? (zeit - summe[tief]!) / spanne : 0;
  return (tief + rest) / n;
}
