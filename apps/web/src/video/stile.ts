/**
 * Die Kartenstile der Reiseanimation.
 *
 * Bewusst getrennt von der Szene: Welche Karte unter dem Video liegt, ist eine
 * Frage der Herkunft und der Lizenz, nicht der Animation. Jede Quelle traegt
 * ihren Herkunftshinweis selbst, damit er im fertigen Video nicht fehlt.
 */
import type { StyleSpecification } from 'maplibre-gl';
import { TILE_ATTRIBUTION, TILE_URL } from '../lib/env';

export const STILE = {
  liberty: 'Vektor – farbig',
  bright: 'Vektor – hell',
  positron: 'Vektor – zurueckhaltend',
  satellit: 'Satellitenbild',
  raster: 'Raster (Rueckfallebene)',
} as const;
export type StilArt = keyof typeof STILE;

const VEKTOR_STIL = (art: StilArt) => `https://tiles.openfreemap.org/styles/${art}`;

/**
 * Satellitenbild von EOX (Sentinel-2 cloudless).
 *
 * WMTS zaehlt Zeile vor Spalte, die Kacheladresse lautet deshalb {z}/{y}/{x}
 * und nicht wie sonst {z}/{x}/{y} -- mit der ueblichen Reihenfolge landet man
 * irgendwo auf der Welt, aber nicht dort, wo man hinwollte.
 */
const SATELLIT_KACHELN =
  'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg';
const SATELLIT_HERKUNFT =
  'EOxCloudless <a href="https://cloudless.eox.at">cloudless.eox.at</a> by EOX IT Services GmbH ' +
  '(Contains modified Copernicus Sentinel data 2024)';

/** Beschriftungen, die auch ueber dem Satellitenbild stehen bleiben sollen. */
const SATELLIT_BESCHRIFTUNG = new Set([
  'label_city',
  'label_city_capital',
  'label_country_1',
  'label_country_2',
  'label_country_3',
  'label_state',
  'water_name_point_label',
]);

/**
 * Hoehendaten fuer die Gelaendedarstellung. Frei und ohne Schluessel; die
 * Kachel kodiert die Hoehe im Terrarium-Format.
 */
export const GELAENDE_KACHELN =
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const GELAENDE_HERKUNFT =
  'Hoehendaten: <a href="https://github.com/tilezen/joerd">Tilezen</a> (EU-DEM / Copernicus)';

/**
 * Beschriftungen, die eine Reiseanimation nur unruhig machen: jedes Dorf, jeder
 * Strassenname, jeder Punkt am Wegesrand. Staedte, Laender und Gewaesser
 * bleiben stehen, weil sie die Orientierung tragen.
 */
export const UNRUHIGE_EBENEN = [
  'label_village',
  // Kleinstaedte fallen mit weg: Bei geneigter Kamera reicht der Blick bis zum
  // Horizont, und dann stehen Dutzende Namen gleichzeitig im Bild.
  'label_town',
  'highway-name-path',
  'highway-name-minor',
  'highway-name-major',
  'highway-shield-non-us',
  'highway-shield-us-interstate',
  'road_shield_us',
  'road_one_way_arrow',
  'road_one_way_arrow_opposite',
  'poi_r20',
  'poi_r7',
  'poi_r1',
  'poi_transit',
  'label_other',
];

/**
 * Rasterkacheln als Rueckfallebene.
 *
 * Vektorkacheln sind das Ziel: Nur damit laesst sich steuern, welche Orte
 * beschriftet werden. Rasterkacheln rendert MapLibre dagegen auch dann, wenn
 * die Bildschleife des Browsers kaum laeuft -- deshalb bleiben sie als
 * Ausweichmoeglichkeit.
 */
function rasterStil(): StyleSpecification {
  return {
    version: 8,
    sources: {
      karte: { type: 'raster', tiles: [TILE_URL], tileSize: 256, attribution: TILE_ATTRIBUTION },
    },
    layers: [{ id: 'karte', type: 'raster', source: 'karte' }],
  };
}

/**
 * Satellitenbild mit den Ortsbeschriftungen aus dem Vektorstil darueber.
 *
 * Die Beschriftungsebenen werden aus dem fertigen Stil uebernommen statt
 * nachgebaut: So bleiben Schriften, Groessen und Zoomschwellen dieselben wie
 * auf der Vektorkarte, und sie wandern mit, wenn der Stil sich aendert.
 */
async function satellitStil(): Promise<StyleSpecification> {
  const vorlage = (await fetch(VEKTOR_STIL('liberty')).then((r) => r.json())) as StyleSpecification;
  return {
    version: 8,
    glyphs: vorlage.glyphs,
    sprite: vorlage.sprite,
    sources: {
      satellit: {
        type: 'raster',
        tiles: [SATELLIT_KACHELN],
        tileSize: 256,
        maxzoom: 14,
        attribution: SATELLIT_HERKUNFT,
      },
      openmaptiles: vorlage.sources!.openmaptiles!,
    },
    layers: [
      { id: 'satellit', type: 'raster', source: 'satellit' },
      ...vorlage.layers.filter((l) => SATELLIT_BESCHRIFTUNG.has(l.id)),
    ],
  };
}

/** Loest einen Stilnamen in das auf, was MapLibre als `style` entgegennimmt. */
export async function ladeStil(art: StilArt): Promise<StyleSpecification | string> {
  if (art === 'raster') return rasterStil();
  if (art === 'satellit') return satellitStil();
  return VEKTOR_STIL(art);
}
