/**
 * Die Szene: alles, was ein Bild der Reiseanimation ausmacht.
 *
 * Frei von React, damit zwei sehr verschiedene Antriebe dieselbe Zeichnung
 * erzeugen -- die Vorschau treibt sie mit der Uhr des Browsers, der Renderer
 * im Container schaltet sie Bild fuer Bild weiter und fotografiert jedes
 * einzeln. Gaebe es die Zeichnung zweimal, liefen Vorschau und Ergebnis
 * frueher oder spaeter auseinander, und genau das soll nicht passieren.
 *
 * Fahrzeug und Etappenschilder sind HTML-Elemente ueber der Karte, nicht Teil
 * des WebGL-Bildes. Deshalb fotografiert der Renderer die ganze Seite und
 * nicht das Canvas: Ein Canvas-Mitschnitt haette die Karte, aber kein
 * Wohnmobil.
 */
import * as maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import { huelle, linieBis } from './track';
import type { Zustand } from './timeline';
import type { VideoBilanz, VideoFoto } from '@ourspots/shared';
import type { Reisedaten } from './reisedaten';
import { DREHBAR, markerSvg, type MarkerArt } from './marker';
import {
  GELAENDE_HERKUNFT,
  GELAENDE_KACHELN,
  ORTSNAMEN_EBENEN,
  UNRUHIGE_EBENEN,
} from './stile';

// MapLibre verarbeitet Vektorkacheln UND GeoJSON-Quellen im Worker. Zeigt
// dessen URL in Vites Modulpipeline, scheitert er stumm: Es rendern dann nur
// noch Rasterkacheln, waehrend die eigene Routenlinie unsichtbar bleibt.
// Siehe scripts/maplibre-worker.mjs.
maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

export interface SzeneOptionen {
  marker: MarkerArt;
  gelaende: boolean;
  ueberhoehung: number;
  ruhigeBeschriftung: boolean;
}

export class Szene {
  private readonly karte: maplibregl.Map;
  private daten: Reisedaten | null = null;
  private optionen: SzeneOptionen;
  private fahrzeug: maplibregl.Marker | null = null;
  private schilder: maplibregl.Marker[] = [];
  /** Zuletzt gezeigte Blickrichtung des Fahrzeugs – siehe Totbereich unten. */
  private blickt: 'ost' | 'west' = 'ost';
  /**
   * Das zuletzt gezeichnete Bild.
   *
   * Wird gebraucht, sobald Teile der Szene neu entstehen: Ein frisch
   * angelegter Fahrzeugmarker sitzt auf der Vorgabekoordinate, ein frisches
   * Schild auf Deckkraft null. Ohne ein erneutes Zeichnen bliebe es dabei, bis
   * sich der Zustand das naechste Mal von selbst aendert -- bei einem
   * pausierten Video also nie. Genau so ist der Fahrzeugmarker nach einem
   * Wechsel der Markerart aus dem Bild verschwunden.
   */
  private letzterZustand: Zustand | null = null;
  private pumpe: number | null = null;
  /**
   * Die Bilder, nach Kennung nachschlagbar.
   *
   * Als fertige `data:`-URI, nicht als Adresse: Im Rendercontainer ist die
   * Seite nicht angemeldet und kann nichts bei der API abrufen.
   */
  private fotos: Record<string, VideoFoto> = {};
  private fotoKasten: HTMLDivElement | null = null;
  private tafel: HTMLDivElement | null = null;
  /** Eckdaten der Reise fuer Titel- und Schlusstafel. */
  private bilanz: VideoBilanz | null = null;
  private zeigeTitel = false;
  private zeigeSchluss = false;
  /**
   * Die urspruenglichen Filter der Beschriftungsebenen.
   *
   * Gemerkt, bevor etwas daran geaendert wird: Der Stil bringt eigene Filter
   * mit (Zoomschwellen, Ortsgroessen), und die duerfen nicht verloren gehen,
   * wenn die eigenen Stationsnamen dazukommen.
   */
  private urspruenglicheFilter = new Map<string, unknown>();

  private constructor(karte: maplibregl.Map, optionen: SzeneOptionen) {
    this.karte = karte;
    this.optionen = optionen;
  }

  /**
   * Baut die Karte auf und kehrt erst zurueck, wenn ihr Stil steht.
   *
   * Bewusst als Fabrik statt als Konstruktor: Vorher gibt es keine Szene, auf
   * der sich Ebenen anlegen liessen, und ein halb fertiges Objekt waere eine
   * Falle fuer jeden Aufrufer.
   */
  static async erzeuge(
    behaelter: HTMLElement,
    stil: StyleSpecification | string,
    optionen: SzeneOptionen,
  ): Promise<Szene> {
    const karte = new maplibregl.Map({
      container: behaelter,
      style: stil,
      center: [10.4, 51.1],
      zoom: 5,
      attributionControl: { compact: false },
      // Beim Abfilmen stoert eine laufende Nutzerbewegung nur.
      interactive: false,
      // Der Renderer haelt die Zeit selbst an; eine weiche Kamerafahrt
      // zwischen zwei Bildern waere dort nur ein Rest aus dem vorigen Bild.
      fadeDuration: 0,
    });
    await new Promise<void>((fertig) => karte.on('load', () => fertig()));

    const szene = new Szene(karte, optionen);
    szene.legeFotokastenAn(behaelter);
    szene.legeTafelAn(behaelter);
    szene.legeRoutenebenenAn();
    szene.richteGelaendeEin();
    szene.duenneBeschriftungAus();
    szene.setzeFahrzeug();
    return szene;
  }

  /** Nur fuer Sonderfaelle, die unmittelbar an MapLibre muessen. */
  get maplibre(): maplibregl.Map {
    return this.karte;
  }

  // --- Aufbau --------------------------------------------------------------

  /**
   * Der Rahmen fuer das Foto eines Halts.
   *
   * Liegt fest in einer Ecke und nicht als Marker auf der Karte: Ein Bild, das
   * mit der Karte wandert und sich unter der geneigten Kamera verzerrt, ist
   * nicht mehr anzusehen. In der Ecke steht es ruhig und verdeckt nichts
   * Wichtiges.
   */
  private legeFotokastenAn(behaelter: HTMLElement): void {
    const el = document.createElement('div');
    el.className = 'videofoto';
    el.innerHTML = `<img class="videofoto__bild" alt=""><span class="videofoto__text"></span>`;
    el.style.opacity = '0';
    behaelter.appendChild(el);
    this.fotoKasten = el;
  }

  /** Route als zwei Linien: die ganze Strecke blass, das Gefahrene kraeftig. */
  /**
   * Die Tafel fuer Titel und Schlussbilanz.
   *
   * Ein Element fuer beides: Sie erscheinen nie gleichzeitig -- die eine liegt
   * im Vorspann, die andere im Abspann --, und zwei Elemente waeren nur zwei
   * Stellen, an denen dieselbe Gestaltung auseinanderlaufen kann.
   */
  private legeTafelAn(behaelter: HTMLElement): void {
    const el = document.createElement('div');
    el.className = 'videotafel';
    el.innerHTML =
      `<span class="videotafel__titel"></span>` +
      `<span class="videotafel__zeile"></span>` +
      `<span class="videotafel__zahlen"></span>`;
    el.style.opacity = '0';
    behaelter.appendChild(el);
    this.tafel = el;
  }

  /** Beschriftet die Tafel und blendet sie passend ein. */
  private zeichneTafel(zustand: Zustand): void {
    const el = this.tafel;
    if (!el) return;

    const art = zustand.tafel?.art;
    const gewuenscht = art === 'titel' ? this.zeigeTitel : art === 'schluss' ? this.zeigeSchluss : false;
    if (!art || !gewuenscht || !this.bilanz) {
      el.style.opacity = '0';
      return;
    }

    const b = this.bilanz;
    el.style.opacity = String(zustand.tafel!.staerke);
    el.querySelector('.videotafel__titel')!.textContent =
      art === 'titel' ? b.titel : 'Die Reise in Zahlen';
    el.querySelector('.videotafel__zeile')!.textContent =
      art === 'titel' ? (b.zeitraum ?? '') : b.titel;

    const zahlen = el.querySelector<HTMLElement>('.videotafel__zahlen');
    if (!zahlen) return;
    if (art === 'titel') {
      zahlen.textContent = '';
      zahlen.style.display = 'none';
      return;
    }
    zahlen.style.display = '';
    // Hoehenmeter nur, wenn die Route welche hergibt -- eine Null waere eine
    // Aussage, die wir nicht treffen koennen.
    zahlen.innerHTML = '';
    const zahl = (wert: string, text: string) => {
      const kasten = document.createElement('span');
      kasten.className = 'videotafel__zahl';
      const oben = document.createElement('strong');
      oben.textContent = wert;
      const unten = document.createElement('span');
      unten.textContent = text;
      kasten.append(oben, unten);
      zahlen.appendChild(kasten);
    };
    zahl(`${Math.round(b.distanzM / 1000).toLocaleString('de-DE')} km`, 'gefahren');
    if (b.aufstiegM > 0) {
      zahl(`${Math.round(b.aufstiegM).toLocaleString('de-DE')} m`, 'bergauf');
    }
    if (b.tage !== null) zahl(String(b.tage), b.tage === 1 ? 'Tag' : 'Tage');
    zahl(String(b.stationen), b.stationen === 1 ? 'Station' : 'Stationen');
  }

  private legeRoutenebenenAn(): void {
    const m = this.karte;
    const leer = { type: 'FeatureCollection' as const, features: [] };

    for (const q of ['route-gesamt', 'route-gefahren']) {
      if (!m.getSource(q)) m.addSource(q, { type: 'geojson', data: leer });
    }

    // Reihenfolge ist Absicht: erst die noch offene Strecke gestrichelt und
    // blass, darueber der gefahrene Weg mit heller Fassung. Die Fassung sorgt
    // dafuer, dass die Linie auch ueber Wald und Stadtflaechen lesbar bleibt --
    // ohne sie verschwindet ein dunkles Gruen im Kartenbild.
    const ebenen = [
      {
        id: 'route-gesamt',
        quelle: 'route-gesamt',
        farbe: '#5b6560',
        breite: 3,
        deckung: 0.55,
        strich: [1.5, 2.2] as [number, number] | null,
      },
      {
        id: 'route-gefahren-fassung',
        quelle: 'route-gefahren',
        farbe: '#ffffff',
        breite: 9,
        deckung: 0.95,
        strich: null,
      },
      {
        id: 'route-gefahren',
        quelle: 'route-gefahren',
        farbe: '#1f6f5c',
        breite: 5,
        deckung: 1,
        strich: null,
      },
    ];

    for (const e of ebenen) {
      if (m.getLayer(e.id)) continue;
      m.addLayer({
        id: e.id,
        type: 'line',
        source: e.quelle,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': e.farbe,
          'line-width': e.breite,
          'line-opacity': e.deckung,
          ...(e.strich ? { 'line-dasharray': e.strich } : {}),
        },
      });
    }
  }

  /**
   * Gelaende und Himmel.
   *
   * Das Hoehenmodell kommt als eigene Quelle dazu; MapLibre verformt damit die
   * Kacheln raeumlich. Der Himmel gibt der geneigten Kamera einen Horizont --
   * ohne ihn endet die Welt an einer harten Kante.
   */
  private richteGelaendeEin(): void {
    const m = this.karte;

    if (!m.getSource('gelaende')) {
      m.addSource('gelaende', {
        type: 'raster-dem',
        tiles: [GELAENDE_KACHELN],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 13,
        attribution: GELAENDE_HERKUNFT,
      });
    }

    // Schattierung aus demselben Hoehenmodell. Die Verformung allein sieht man
    // aus der Luft kaum -- erst Licht und Schatten machen Taeler und Haenge
    // wirklich lesbar. Unter die Beschriftung einsortiert, damit Ortsnamen
    // obenauf bleiben.
    if (!m.getLayer('schattierung')) {
      const ersteBeschriftung = m.getStyle()?.layers?.find((l) => l.type === 'symbol')?.id;
      m.addLayer(
        {
          id: 'schattierung',
          type: 'hillshade',
          source: 'gelaende',
          paint: {
            'hillshade-exaggeration': 0.75,
            'hillshade-shadow-color': '#2c3e3a',
            'hillshade-highlight-color': '#ffffff',
            'hillshade-accent-color': '#6b7570',
          },
        },
        ersteBeschriftung,
      );
    }

    const an = this.optionen.gelaende;
    m.setLayoutProperty('schattierung', 'visibility', an ? 'visible' : 'none');
    if (an) {
      m.setTerrain({ source: 'gelaende', exaggeration: this.optionen.ueberhoehung });
      // Nur die drei Eigenschaften, die diese MapLibre-Fassung kennt --
      // unbekannte Werte weist sie zurueck und der Himmel bliebe ganz aus.
      m.setSky?.({
        'sky-color': '#9fc5e8',
        'horizon-color': '#eaf0f4',
        'fog-color': '#eaf0f4',
      });
    } else {
      m.setTerrain(null);
    }
  }

  /**
   * Blendet die Kartenbeschriftung der eigenen Stationen aus.
   *
   * Sonst steht "Bremen" zweimal im Bild: einmal auf dem Etappenschild, einmal
   * als Ortsname der Karte direkt darunter. Dauerhaft und nicht nur waehrend
   * des Halts -- ein Name, der kurz vor dem Schild verschwindet und danach
   * wieder auftaucht, faellt mehr auf als einer, der gar nicht da ist. Den Ort
   * benennt ja ohnehin das Schild.
   */
  private verbergeStationsnamen(): void {
    const m = this.karte;
    const namen = (this.daten?.stationen ?? [])
      .map((s) => s.name.trim())
      .filter((n) => n.length > 0);

    for (const id of ORTSNAMEN_EBENEN) {
      if (!m.getLayer(id)) continue;

      if (!this.urspruenglicheFilter.has(id)) {
        this.urspruenglicheFilter.set(id, m.getFilter(id) ?? null);
      }
      const vorher = this.urspruenglicheFilter.get(id) as unknown[] | null;

      if (namen.length === 0) {
        m.setFilter(id, (vorher ?? null) as never);
        continue;
      }

      // Der Stil beschriftet je nach Sprache aus verschiedenen Feldern --
      // beide pruefen, sonst bleibt der deutsche Name stehen.
      const eigene = [
        'any',
        ['in', ['get', 'name'], ['literal', namen]],
        ['in', ['get', 'name:de'], ['literal', namen]],
      ];
      const filter = vorher
        ? ['all', vorher, ['!', eigene]]
        : ['!', eigene];
      m.setFilter(id, filter as never);
    }
  }

  private duenneBeschriftungAus(): void {
    const m = this.karte;
    for (const id of UNRUHIGE_EBENEN) {
      if (!m.getLayer(id)) continue;
      m.setLayoutProperty(id, 'visibility', this.optionen.ruhigeBeschriftung ? 'none' : 'visible');
    }
  }

  private setzeFahrzeug(): void {
    this.fahrzeug?.remove();
    const el = document.createElement('div');
    el.className = 'fahrzeugmarker';
    // Eigene Huelle fuer die Ausrichtung: MapLibre schreibt das transform des
    // aeusseren Elements selbst, um den Marker zu positionieren.
    el.innerHTML = `<span class="fahrzeugmarker__bild">${markerSvg(this.optionen.marker)}</span>`;
    this.fahrzeug = new maplibregl.Marker({
      element: el,
      // Sobald Gelaende an ist, blendet MapLibre verdeckte Marker auf ein
      // Fuenftel herunter -- gedacht fuer Stecknadeln, die hinter einem Berg
      // liegen und dort nicht schweben sollen. Das Fahrzeug ist aber kein
      // Punkt auf der Karte, sondern das, dem man zusieht: Hinter jedem Huegel
      // verblasste es und kam dahinter wieder hervor. Es bleibt deshalb immer
      // voll sichtbar.
      opacityWhenCovered: '1',
    })
      .setLngLat([10.4, 51.1])
      .addTo(this.karte);
  }

  private setzeSchilder(): void {
    this.schilder.forEach((s) => s.remove());
    const laengeM = this.daten?.track.laengeM ?? 0;
    this.schilder = (this.daten?.stationen ?? []).map((station) => {
      // Zwei Ebenen mit Absicht: Das aeussere Element gehoert MapLibre -- es
      // schreibt dort Position und, sobald Gelaende an ist, auch die
      // Deckkraft, um verdeckte Marker abzublenden. Ein eigenes opacity waere
      // beim naechsten Bild wieder weg, und dann stuenden alle Schilder der
      // Reise gleichzeitig im Bild. Ein- und Ausblenden passiert deshalb auf
      // der inneren Huelle.
      const el = document.createElement('div');
      el.className = 'etappenschild';
      el.innerHTML =
        `<span class="etappenschild__inhalt">` +
        `<span class="etappenschild__tafel">` +
        `<span class="etappenschild__name"></span>` +
        `<span class="etappenschild__km"></span>` +
        `</span>` +
        `<span class="etappenschild__pfosten"></span>` +
        `<span class="etappenschild__punkt"></span>` +
        `</span>`;
      // textContent statt innerHTML: Ortsnamen kommen aus der Reise des
      // Nutzers und aus der Geocodierung, nicht aus dieser Datei.
      el.querySelector('.etappenschild__name')!.textContent = station.name;
      el.querySelector('.etappenschild__km')!.textContent = kmText(station.anteil * laengeM);
      el.querySelector<HTMLElement>('.etappenschild__inhalt')!.style.opacity = '0';
      // Dieselbe Ueberlegung wie beim Fahrzeug: Ein Schild, das der Berg
      // davor halb wegnimmt, ist nicht mehr zu lesen.
      return new maplibregl.Marker({ element: el, anchor: 'bottom', opacityWhenCovered: '1' })
        .setLngLat(station.ort)
        .addTo(this.karte);
    });
  }

  // --- Aenderungen ---------------------------------------------------------

  /** Die Bilder, die in diesem Video vorkommen koennen. */
  setzeFotos(fotos: Record<string, VideoFoto>): void {
    this.fotos = fotos;
  }

  /** Eckdaten und ob Titel- bzw. Schlusstafel ueberhaupt erscheinen sollen. */
  setzeBilanz(bilanz: VideoBilanz | null, titel: boolean, schluss: boolean): void {
    this.bilanz = bilanz;
    this.zeigeTitel = titel;
    this.zeigeSchluss = schluss;
    this.zeichneErneut();
  }

  setzeDaten(daten: Reisedaten | null): void {
    this.daten = daten;
    this.setzeSchilder();
    this.verbergeStationsnamen();
    const quelle = this.karte.getSource('route-gesamt') as maplibregl.GeoJSONSource | undefined;
    quelle?.setData(
      daten
        ? {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: daten.track.punkte },
          }
        : { type: 'FeatureCollection', features: [] },
    );
    this.zeichneErneut();
  }

  /**
   * Aendert die Optionen, die ohne neuen Kartenstil auskommen.
   *
   * Der Stil selbst gehoert nicht dazu: Er wird beim Erzeugen gesetzt. Ihn
   * nachtraeglich zu tauschen wuerde alle eigenen Ebenen mitnehmen, und der
   * Wiederaufbau waere eine zweite, stille Quelle fuer Abweichungen zwischen
   * Vorschau und Video.
   */
  setzeOptionen(teil: Partial<SzeneOptionen>): void {
    const vorher = this.optionen;
    this.optionen = { ...vorher, ...teil };
    if (teil.marker !== undefined && teil.marker !== vorher.marker) this.setzeFahrzeug();
    if (
      (teil.gelaende !== undefined && teil.gelaende !== vorher.gelaende) ||
      (teil.ueberhoehung !== undefined && teil.ueberhoehung !== vorher.ueberhoehung)
    ) {
      this.richteGelaendeEin();
    }
    if (
      teil.ruhigeBeschriftung !== undefined &&
      teil.ruhigeBeschriftung !== vorher.ruhigeBeschriftung
    ) {
      this.duenneBeschriftungAus();
    }
    this.zeichneErneut();
  }

  /**
   * Stellt das zuletzt gezeichnete Bild wieder her.
   *
   * Nach jedem Eingriff, der Elemente neu anlegt. Vor dem ersten Zeichnen gibt
   * es nichts wiederherzustellen -- dann passiert hier nichts.
   */
  private zeichneErneut(): void {
    if (this.letzterZustand) this.zeichne(this.letzterZustand);
  }

  // --- Zeichnen ------------------------------------------------------------

  /** Ein Bild zeichnen – von der Vorschau wie vom Renderer gleichermassen. */
  zeichne(zustand: Zustand): void {
    const m = this.karte;
    const daten = this.daten;
    // Auch ohne Reisedaten merken: Kommen sie spaeter dazu, soll das Bild
    // sofort stimmen und nicht erst beim naechsten Zustandswechsel.
    this.letzterZustand = zustand;
    if (!daten) return;

    const gefahren = linieBis(daten.track, zustand.streckenAnteil);
    const quelle = m.getSource('route-gefahren') as maplibregl.GeoJSONSource | undefined;
    quelle?.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: gefahren },
    });

    // Wie weit das Fahrzeug auf dem Bildschirm von "nach oben" abweicht.
    // Dreht die Karte voll mit (drehung = 1), zeigt es immer nach oben; steht
    // Norden oben (0), entspricht es dem Kurs. Dazwischen anteilig.
    const schirmkurs = zustand.kurs * (1 - zustand.drehung);

    this.fahrzeug?.setLngLat(zustand.ort);
    const bild = this.fahrzeug?.getElement().querySelector<HTMLElement>('.fahrzeugmarker__bild');
    if (bild) {
      // Eine perspektivische Zeichnung darf nicht frei rotieren, sonst faehrt
      // das Fahrzeug bei Suedkurs auf dem Dach. Sie wird nur gespiegelt.
      // Dreht die Kamera mit, zeigt die Fahrtrichtung ohnehin immer nach oben.
      if (DREHBAR[this.optionen.marker]) {
        bild.style.transform = `rotate(${schirmkurs}deg)`;
      } else {
        // Totbereich um Nord und Sued: Dort ist die Ost-West-Entscheidung
        // ohnehin fast beliebig, und ohne ihn kippt das Fahrzeug bei jeder
        // kleinen Kurve hin und her. Umgedreht wird erst, wenn der Kurs
        // eindeutig in die andere Haelfte zeigt. Gerechnet wird mit dem
        // Bildschirmkurs: Dreht die Karte mit, steht das Fahrzeug ohnehin
        // aufrecht und soll nicht gespiegelt werden.
        const kurs = (schirmkurs + 360) % 360;
        if (kurs > 200 && kurs < 340) this.blickt = 'west';
        else if (kurs > 20 && kurs < 160) this.blickt = 'ost';
        bild.style.transform = this.blickt === 'west' ? 'scaleX(-1)' : 'none';
      }
    }

    // Zwischen Uebersicht und Nahaufnahme blenden.
    const blick = zustand.kurs * zustand.drehung;
    if (zustand.naehe < 0.999) {
      const [west, sued, ost, nord] = huelle(daten.track.punkte);
      const uebersicht = m.cameraForBounds(
        [
          [west, sued],
          [ost, nord],
        ],
        { padding: 60 },
      );
      const zielZoom = uebersicht?.zoom ?? 5;
      const ziel = (uebersicht?.center ?? { lng: 10.4, lat: 51.1 }) as { lng: number; lat: number };
      m.jumpTo({
        center: [
          ziel.lng + (zustand.ort[0] - ziel.lng) * zustand.naehe,
          ziel.lat + (zustand.ort[1] - ziel.lat) * zustand.naehe,
        ],
        zoom: zielZoom + (zustand.zoom - zielZoom) * zustand.naehe,
        bearing: blick * zustand.naehe,
        pitch: zustand.neigung * zustand.naehe,
      });
    } else {
      m.jumpTo({
        center: zustand.ort,
        zoom: zustand.zoom,
        bearing: blick,
        pitch: zustand.neigung,
      });
    }

    // Das Foto des aktuellen Halts.
    if (this.fotoKasten) {
      const gewaehlt = zustand.foto ? this.fotos[zustand.foto.id] : undefined;
      const staerke = gewaehlt ? zustand.foto!.staerke : 0;
      this.fotoKasten.style.opacity = String(staerke);
      // Die Quelle nur bei Bedarf tauschen: Ein erneutes Setzen desselben
      // data:-URI laesst den Browser das Bild neu aufbauen, und im Video
      // waere an der Stelle ein leerer Rahmen zu sehen.
      const bild = this.fotoKasten.querySelector<HTMLImageElement>('.videofoto__bild');
      if (bild && gewaehlt && bild.dataset.kennung !== zustand.foto!.id) {
        bild.dataset.kennung = zustand.foto!.id;
        bild.src = gewaehlt.bild;
      }
      const text = this.fotoKasten.querySelector<HTMLElement>('.videofoto__text');
      if (text) {
        text.textContent = gewaehlt?.caption ?? '';
        text.style.display = gewaehlt?.caption ? '' : 'none';
      }
    }

    this.zeichneTafel(zustand);

    // Eine Zuordnung statt einer Suche je Schild: Bei einer Reise mit vielen
    // Wegpunkten laeuft das hier je Bild.
    const staerken = new Map<number, number>();
    for (const s of zustand.schilder) staerken.set(s.station, s.staerke);

    this.schilder.forEach((schild, i) => {
      const sichtbar = staerken.get(i) ?? 0;
      const inhalt = schild.getElement().querySelector<HTMLElement>('.etappenschild__inhalt');
      if (!inhalt) return;
      inhalt.style.opacity = String(sichtbar);
      inhalt.style.setProperty('--hub', `${(1 - sichtbar) * 10}px`);
    });
  }

  /**
   * Rendert nach einer Aenderung mehrfach nach und hoert auf, sobald die Karte
   * zur Ruhe kommt.
   *
   * MapLibre entscheidet erst beim Rendern, welche Kacheln es braucht, und
   * zeichnet eintreffende Kacheln erst im naechsten Bild. Laeuft die
   * Bildschleife des Browsers nicht -- etwa in einem Hintergrund-Tab --, bleibt
   * die Karte deshalb leer. Ein einzelnes redraw() genuegt nicht: Es stoesst
   * das Laden nur an. Im Normalbetrieb kostet das nichts, weil der idle-Zustand
   * nach wenigen Bildern erreicht ist.
   *
   * Das ist die Antwort der Vorschau. Der Renderer nimmt stattdessen `ruhig()`,
   * weil er jedes Bild wirklich fertig braucht, bevor er es fotografiert.
   */
  nachrendern(): void {
    const m = this.karte;
    if (this.pumpe !== null) window.clearInterval(this.pumpe);
    let bilder = 0;
    this.pumpe = window.setInterval(() => {
      m.redraw();
      // Obergrenze, damit die Pumpe nicht ewig laeuft, wenn nie Ruhe einkehrt.
      if (++bilder > 40 || m.loaded()) {
        if (this.pumpe !== null) window.clearInterval(this.pumpe);
        this.pumpe = null;
      }
    }, 80);
  }

  /**
   * Wartet, bis die Karte alles geladen und gezeichnet hat.
   *
   * Der Renderer fotografiert erst danach -- sonst landen halb geladene
   * Kacheln im Video, und zwar genau an den Stellen, an denen die Kamera neues
   * Gebiet erreicht. Das Zeitlimit ist kein Komfort, sondern Notwendigkeit:
   * Eine einzige haengende Kachel wuerde den ganzen Auftrag anhalten. Lieber
   * ein unscharfes Bild als ein Video, das nie fertig wird.
   */
  async ruhig(zeitlimitMs = 15000): Promise<boolean> {
    const m = this.karte;
    return new Promise<boolean>((fertig) => {
      let abgeschlossen = false;
      const abmelden = () => {
        window.clearTimeout(uhr);
        m.off('idle', beiRuhe);
      };
      const beiRuhe = () => {
        if (abgeschlossen) return;
        abgeschlossen = true;
        abmelden();
        fertig(true);
      };
      const uhr = window.setTimeout(() => {
        if (abgeschlossen) return;
        abgeschlossen = true;
        abmelden();
        fertig(false);
      }, zeitlimitMs);
      m.on('idle', beiRuhe);
      // Ohne diesen Anstoss gibt es kein naechstes Bild und damit auch kein
      // idle: Die Karte ruht ja bereits.
      m.triggerRepaint();
    });
  }

  zerstoere(): void {
    if (this.pumpe !== null) window.clearInterval(this.pumpe);
    this.pumpe = null;
    this.schilder.forEach((s) => s.remove());
    this.schilder = [];
    this.fahrzeug?.remove();
    this.fahrzeug = null;
    this.fotoKasten?.remove();
    this.fotoKasten = null;
    this.tafel?.remove();
    this.tafel = null;
    this.karte.remove();
  }
}

/**
 * Kilometerstand fuer das Etappenschild.
 *
 * Bewusst ohne Nachkommastelle und mit Tausenderpunkt: Auf einem Schild, das
 * zwei Sekunden im Bild steht, liest niemand Zehntelkilometer.
 */
function kmText(meter: number): string {
  return `km ${Math.round(meter / 1000).toLocaleString('de-DE')}`;
}
