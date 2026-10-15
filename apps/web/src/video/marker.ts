/**
 * Auswaehlbare Marker fuer die Reiseanimation.
 *
 * Flache Seitenansicht mit kraeftiger dunkler Kontur: Das bleibt auch klein im
 * Bild und ueber jeder Karte lesbar -- ueber Wald, ueber Stadtflaechen, ueber
 * dem Satellitenbild. Eine perspektivische Zeichnung mit Verlaeufen verliert
 * genau dort ihre Konturen.
 *
 * Die Seitenansicht hat dieselbe Folge fuer die Ausrichtung wie eine
 * perspektivische: Sie darf gespiegelt, aber nicht gedreht werden -- siehe
 * `DREHBAR`.
 */

export type MarkerArt = 'wohnmobil' | 'auto' | 'punkt';

export const MARKER_NAMEN: Record<MarkerArt, string> = {
  wohnmobil: 'Wohnmobil',
  auto: 'Auto',
  punkt: 'Punkt',
};

/**
 * Ob der Marker frei gedreht werden darf.
 *
 * Eine Seitenansicht vertraegt das nicht: Bei Fahrtrichtung Sueden stuende das
 * Fahrzeug auf dem Dach. Solche Marker werden deshalb nur gespiegelt, wenn es
 * nach Westen geht. Der flache Punkt darf rotieren.
 */
export const DREHBAR: Record<MarkerArt, boolean> = {
  wohnmobil: false,
  auto: false,
  punkt: true,
};

/** Dunkles Blaugrau fuer alle Konturen – traegt die Form auch bei 20 Pixeln. */
const KONTUR = '#16232c';
/** Fensterglas. Warm, damit es sich von jedem Blau der Karte absetzt. */
const GLAS = '#a35f45';
/** Zierstreifen, heller als die Routenlinie, aber aus derselben Familie. */
const STREIFEN = '#7ecfa4';

const SCHATTEN = (cx: number, rx: number) =>
  `<ellipse cx="${cx}" cy="47.5" rx="${rx}" ry="2.8" fill="#12362d" opacity="0.22"/>`;

/** Wohnmobil, Blickrichtung rechts. */
const WOHNMOBIL = `
  ${SCHATTEN(32, 23)}
  <!--
    Teilintegrierter: hoher Wohnteil hinten, das Dach faellt zur Fahrerkabine
    hin ab. Dieser Knick traegt die ganze Form -- ohne ihn ist es ein Kasten.
    Der Absatz bleibt flach und die Kabine lang: Ein tiefer, kurzer Vorderbau
    sieht aus wie ein Lieferwagen mit Aufsatz.
  -->
  <path d="M8 41 L8 22 Q8 20 10 20 L42 20 L48.5 25.5 L56 25.5
           Q58.2 25.6 58.5 28 L58.5 39 Q58.5 41 56.5 41 Z"
        fill="#ffffff" stroke="${KONTUR}" stroke-width="2.2" stroke-linejoin="round"/>
  <!-- Windschutzscheibe: nach unten breiter, das liest sich als Neigung. -->
  <path d="M50.8 27.3 L56.2 27.3 L56.9 31.9 L50.1 31.9 Z" fill="${GLAS}"/>
  <!-- Wohnteil: grosses Fenster hinten, Aufbautuer vor dem Dachknick. -->
  <rect x="12" y="23.4" width="15.5" height="7.4" rx="1.6" fill="${GLAS}"/>
  <rect x="31.5" y="23.4" width="9" height="9.6" rx="1.4"
        fill="#ffffff" stroke="${KONTUR}" stroke-width="1.7"/>
  <rect x="9.4" y="34.8" width="48" height="2.6" fill="${STREIFEN}"/>
  <!--
    Raeder hell mit kraeftigem Rand statt dunkler Scheiben: Der Rand liest sich
    ueber dem weissen Aufbau als Radkasten, eine dunkle Flaeche waere auf einer
    dunklen Karte dagegen einfach weg.
  -->
  <circle cx="19" cy="41" r="4.6" fill="#ffffff" stroke="${KONTUR}" stroke-width="2.2"/>
  <circle cx="48.5" cy="41" r="4.6" fill="#ffffff" stroke="${KONTUR}" stroke-width="2.2"/>`;

/** Kombi, Blickrichtung rechts – dieselbe Bildsprache wie das Wohnmobil. */
const AUTO = `
  ${SCHATTEN(32, 19)}
  <path d="M10 42 L10 34 Q10 32.4 11.6 32 L20 30 L27 24.6 Q27.8 24 28.8 24 L41 24
           Q42.2 24 43 24.9 L48 31.6 L52.6 32.6 Q54 33 54 34.4 L54 40 Q54 42 52 42 Z"
        fill="#ffffff" stroke="${KONTUR}" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M29.6 26.8 L36 26.8 L36 31.4 L25.6 31.4 Z" fill="${GLAS}"/>
  <path d="M38.4 26.8 L41 26.8 L45 31.4 L38.4 31.4 Z" fill="${GLAS}"/>
  <rect x="11.6" y="36.2" width="40.6" height="2.8" fill="${STREIFEN}"/>
  <circle cx="20" cy="42" r="4.4" fill="#ffffff" stroke="${KONTUR}" stroke-width="2.2"/>
  <circle cx="45" cy="42" r="4.4" fill="#ffffff" stroke="${KONTUR}" stroke-width="2.2"/>`;

const PUNKT = `
  ${SCHATTEN(32, 11)}
  <circle cx="32" cy="32" r="13" fill="#ffffff" stroke="${KONTUR}" stroke-width="3"/>
  <circle cx="32" cy="32" r="6" fill="#b3261e"/>`;

const FORMEN: Record<MarkerArt, string> = {
  wohnmobil: WOHNMOBIL,
  auto: AUTO,
  punkt: PUNKT,
};

export function markerSvg(art: MarkerArt, groesse = 52): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${groesse}" height="${groesse}">${FORMEN[art]}</svg>`;
}
