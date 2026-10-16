import { useCallback, useEffect, useMemo, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { StyleSpecification } from 'maplibre-gl';
import { VIDEO_GROESSEN, videoAufloesung, type VideoInput } from '@ourspots/shared';
import {
  useCachedRoute,
  useCalculateRoute,
  useDeleteVideo,
  useSpots,
  useStages,
  useStartVideo,
  useTrip,
  useVideoJob,
  useVideoStatus,
  useWaypoints,
  useEigeneMusik,
  useMusikStuecke,
} from '../../api/hooks';
import { ErrorState, Loading } from '../States';
import { MusikUpload } from './MusikUpload';
import { formatDateRange, formatKm } from '../../lib/format';
import { baueReisedaten } from '../../video/reisedaten';
import { entfernung } from '../../video/track';
import {
  baueZeitachse,
  stationenMitHalt,
  VORGABE,
  zeitFuerAnteil,
  zustandBei,
  type Einstellungen,
} from '../../video/timeline';
import { kameraBei, type Kamerapunkt } from '../../video/kamerakurve';
import { MARKER_NAMEN, type MarkerArt } from '../../video/marker';
import { Szene } from '../../video/szene';
import { ladeStil, STILE, type StilArt } from '../../video/stile';

/**
 * Vorschau der Reiseanimation – und die Stelle, an der das Video in Auftrag
 * gegeben wird.
 *
 * Die Animation selbst steckt in src/video/ und ist frei von React: Hier wird
 * sie von der Uhr getrieben, im Container schaltet der Renderer dieselbe Szene
 * Bild fuer Bild weiter. Nur so zeigt die Vorschau wirklich das, was im Video
 * landet.
 */

/** Bis hierhin gilt ein Stellplatz als "an dieser Station". */
const NAHE_GENUG_M = 3000;

interface Props {
  tripId: string;
}

export function TripVideo({ tripId }: Props) {
  const trip = useTrip(tripId);
  const stages = useStages(tripId);
  const waypoints = useWaypoints(tripId);
  const cached = useCachedRoute(tripId);
  const calculate = useCalculateRoute(tripId);
  const route = calculate.data ?? cached;

  const [stil, setStil] = useState<StilArt>('liberty');
  const [stilSpec, setStilSpec] = useState<StyleSpecification | string | null>(null);
  const [gelaende, setGelaende] = useState(true);
  const [ueberhoehung, setUeberhoehung] = useState(3);
  const [ruhigeBeschriftung, setRuhigeBeschriftung] = useState(true);
  const [markerArt, setMarkerArt] = useState<MarkerArt>('wohnmobil');
  const [einstellungen, setEinstellungen] = useState<Einstellungen>(VORGABE);
  const [laeuft, setLaeuft] = useState(false);
  const [zeit, setZeit] = useState(0);
  const [groesse, setGroesse] = useState<keyof typeof VIDEO_GROESSEN>('720p');
  const [titel, setTitel] = useState(true);
  const [schluss, setSchluss] = useState(true);
  const [musik, setMusik] = useState<string | null>(null);
  const [musikLautstaerke, setMusikLautstaerke] = useState(0.35);
  const [bilderProSekunde, setBilderProSekunde] = useState(25);

  // Ohne berechnete Route gibt es keine Geometrie – einmal anstossen.
  const [angestossen, setAngestossen] = useState(false);
  useEffect(() => {
    if (route || angestossen || calculate.isPending) return;
    setAngestossen(true);
    calculate.mutate({});
  }, [route, angestossen, calculate]);

  const daten = useMemo(() => {
    if (!route || !stages.data || !waypoints.data) return null;
    return baueReisedaten(route, stages.data, waypoints.data);
  }, [route, stages.data, waypoints.data]);

  const zeitachse = useMemo(() => {
    if (!daten) return null;
    return baueZeitachse(daten.track, daten.etappen, daten.stationen, einstellungen);
  }, [daten, einstellungen]);

  const zustand = useMemo(() => {
    if (!daten || !zeitachse) return null;
    return zustandBei(zeitachse, daten.track, einstellungen, zeit);
  }, [daten, zeitachse, einstellungen, zeit]);

  /** Genau das, was auch der Renderer bekommt. */
  const rezept: VideoInput = useMemo(
    () => ({
      stil,
      marker: markerArt,
      gelaende,
      ueberhoehung,
      ruhigeBeschriftung,
      einstellungen,
      groesse,
      titel,
      schluss,
      musik,
      musikLautstaerke,
      bilderProSekunde,
    }),
    [
      stil,
      markerArt,
      gelaende,
      ueberhoehung,
      ruhigeBeschriftung,
      einstellungen,
      groesse,
      titel,
      schluss,
      musik,
      musikLautstaerke,
      bilderProSekunde,
    ],
  );

  // --- Kamerafahrt ---------------------------------------------------------

  const kameraPunkte = einstellungen.kameraPunkte;

  /** Nur die Stationen, an denen das Video wirklich haelt. */
  const halteStationen = useMemo(
    () => (daten ? stationenMitHalt(daten.etappen, daten.stationen) : []),
    [daten],
  );

  const aendereEinstellungen = useCallback((teil: Partial<Einstellungen>) => {
    setEinstellungen((alt) => ({ ...alt, ...teil }));
  }, []);

  /**
   * Die Fotos der Reise, jeweils der naechstgelegenen Station zugeordnet.
   *
   * Zugeordnet wird ueber die Entfernung, wie schon bei den Stationsnamen:
   * Ein Foto haengt am Stellplatz, und der liegt in aller Regel genau dort,
   * wo das Video ohnehin haelt. Weiter entfernte bleiben unberuecksichtigt --
   * ein Bild aus einem anderen Landesteil unter einem Ortsschild waere nur
   * verwirrend.
   */
  const spots = useSpots({ tripId, limit: 200 });
  const fotosJeStation = useMemo(() => {
    const karte = new Map<number, { id: string; spot: string; caption: string | null }[]>();
    if (!daten || !spots.data) return karte;

    for (const spot of spots.data.items) {
      if (spot.photos.length === 0) continue;
      let beste = NAHE_GENUG_M;
      let index = -1;
      daten.stationen.forEach((station, i) => {
        const d = entfernung([spot.lon, spot.lat], station.ort);
        if (d < beste) {
          beste = d;
          index = i;
        }
      });
      if (index < 0) continue;
      const liste = karte.get(index) ?? [];
      for (const foto of spot.photos) {
        liste.push({ id: foto.id, spot: spot.name, caption: foto.caption });
      }
      karte.set(index, liste);
    }
    return karte;
  }, [daten, spots.data]);

  const setzeStationFoto = useCallback(
    (index: number, fotoId: string | null) => {
      const anzahl = daten?.stationen.length ?? 0;
      const liste = Array.from(
        { length: anzahl },
        (_, i) => einstellungen.fotoProStation[i] ?? null,
      );
      liste[index] = fotoId;
      aendereEinstellungen({ fotoProStation: liste });
    },
    [daten, einstellungen.fotoProStation, aendereEinstellungen],
  );

  /**
   * Setzt einen Punkt an der Stelle, die die Vorschau gerade zeigt.
   *
   * Der neue Punkt uebernimmt den Wert, den die Kurve dort ohnehin schon hat.
   * Dadurch aendert das Setzen allein noch nichts am Bild -- man legt erst
   * fest, *wo* etwas passieren soll, und stellt danach ein, *was*. Wuerde
   * stattdessen die Grundeinstellung uebernommen, sprangen beim zweiten Punkt
   * ploetzlich alle Hoehen durcheinander.
   */
  const setzeKamerapunkt = useCallback(() => {
    if (!zeitachse || !zustand) return;
    const jetzt = kameraBei(zeitachse.kamera, zustand.streckenAnteil);
    const neu: Kamerapunkt = {
      anteil: zustand.streckenAnteil,
      zoom: runde(jetzt.zoom, 0.25),
      neigung: Math.round(jetzt.neigung),
      tempo: runde(jetzt.tempo, 0.25),
      drehung: runde(jetzt.drehung, 0.1),
      // Pause und Foto legt man ausdruecklich an, nicht beilaeufig.
      halt: 0,
      foto: null,
    };
    aendereEinstellungen({
      kameraPunkte: [...kameraPunkte, neu].sort((a, b) => a.anteil - b.anteil),
    });
  }, [zeitachse, zustand, kameraPunkte, aendereEinstellungen]);

  const aendereKamerapunkt = useCallback(
    (index: number, teil: Partial<Kamerapunkt>) => {
      aendereEinstellungen({
        kameraPunkte: kameraPunkte.map((p, i) => (i === index ? { ...p, ...teil } : p)),
      });
    },
    [kameraPunkte, aendereEinstellungen],
  );

  const entferneKamerapunkt = useCallback(
    (index: number) => {
      aendereEinstellungen({ kameraPunkte: kameraPunkte.filter((_, i) => i !== index) });
    },
    [kameraPunkte, aendereEinstellungen],
  );

  /**
   * Haltedauer einer Station setzen.
   *
   * Die Liste wird dabei auf die volle Laenge gebracht und mit der
   * Grundeinstellung gefuellt. Ein Loch darin waere spaeter nicht von "noch
   * nicht gesetzt" zu unterscheiden, und beim Rendern stuende an der Stelle
   * undefined.
   */
  const setzeStationHalt = useCallback(
    (index: number, wert: number) => {
      const anzahl = daten?.stationen.length ?? 0;
      const liste = Array.from(
        { length: anzahl },
        (_, i) => einstellungen.haltProStation[i] ?? einstellungen.haltSekunden,
      );
      liste[index] = wert;
      aendereEinstellungen({ haltProStation: liste });
    },
    [daten, einstellungen.haltProStation, einstellungen.haltSekunden, aendereEinstellungen],
  );

  /** Vorschau an die Stelle eines Kamerapunkts schieben. */
  const springeZu = useCallback(
    (anteil: number) => {
      if (!zeitachse) return;
      setLaeuft(false);
      setZeit(zeitFuerAnteil(zeitachse, anteil));
    },
    [zeitachse],
  );

  // --- Renderauftrag -------------------------------------------------------

  // Ohne eingerichteten Renderer bleibt der ganze Abschnitt weg: Ein Knopf,
  // der nur einen Fehler ausloest, ist schlimmer als gar keiner.
  const rendererDa = useVideoStatus().data?.configured === true;
  const eigeneMusik = useEigeneMusik(tripId);
  const musikStuecke = useMusikStuecke().data ?? [];
  const auftrag = useVideoJob(tripId);
  const starten = useStartVideo(tripId);
  const loeschen = useDeleteVideo(tripId);
  const laeuftGerade =
    auftrag.data?.status === 'wartend' || auftrag.data?.status === 'laeuft';
  const bilderGesamt = zeitachse
    ? Math.ceil(zeitachse.gesamtdauer * bilderProSekunde)
    : 0;

  // --- Karte ---------------------------------------------------------------

  // Den Stil aufloesen, bevor die Szene entsteht: Das Satellitenbild holt sich
  // seine Beschriftungsebenen erst aus dem Vektorstil.
  useEffect(() => {
    let verworfen = false;
    setStilSpec(null);
    ladeStil(stil).then((spec) => {
      if (!verworfen) setStilSpec(spec);
    });
    return () => {
      verworfen = true;
    };
  }, [stil]);

  const [knoten, setKnoten] = useState<HTMLDivElement | null>(null);
  /**
   * Haelt die fertig aufgebaute Szene – nicht bloss ein Flag daneben.
   *
   * React erzeugt Effekte im Entwicklungsbetrieb doppelt. Mit einem separaten
   * "bereit"-Flag konnte das load-Ereignis der ersten Karte das Flag setzen,
   * waehrend die Referenz laengst auf die zweite, noch nicht geladene Karte
   * zeigte. Die Ebenen wurden dann auf einer Karte angelegt, die es nicht mehr
   * gab -- die Route blieb unsichtbar, ohne Fehlermeldung.
   */
  const [szene, setSzene] = useState<Szene | null>(null);

  useEffect(() => {
    if (!knoten || !stilSpec) return;
    let verworfen = false;
    let gebaut: Szene | null = null;

    Szene.erzeuge(knoten, stilSpec, {
      marker: markerArt,
      gelaende,
      ueberhoehung,
      ruhigeBeschriftung,
    }).then((s) => {
      gebaut = s;
      if (verworfen) {
        s.zerstoere();
        return;
      }
      setSzene(s);
    });

    return () => {
      verworfen = true;
      gebaut?.zerstoere();
      setSzene((alt) => (alt === gebaut ? null : alt));
    };
    // Absicht: Nur Knoten und Stil bauen die Szene neu auf. Die uebrigen
    // Optionen wandern ueber setzeOptionen hinein, ohne die Karte zu verlieren
    // -- sonst saehe man bei jedem Klick ein kurzes Flackern und saemtliche
    // Kacheln wuerden erneut geladen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knoten, stilSpec]);

  /**
   * Dieselben Bilder wie im Video, nur anders beschafft.
   *
   * Im Browser des Nutzers laeuft eine angemeldete Sitzung -- hier genuegt die
   * Adresse. Der Renderer bekommt stattdessen `data:`-URIs ins Rezept gelegt,
   * weil er nicht angemeldet ist. Die Szene sieht in beiden Faellen dasselbe.
   */
  useEffect(() => {
    if (!szene) return;
    const fotos: Record<string, { bild: string; caption: string | null }> = {};
    for (const liste of fotosJeStation.values()) {
      for (const foto of liste) {
        fotos[foto.id] = { bild: `/api/photos/${foto.id}?size=thumb`, caption: foto.caption };
      }
    }
    szene.setzeFotos(fotos);
  }, [szene, fotosJeStation]);

  /**
   * Dieselbe Bilanz wie im Video, aus dem, was die Vorschau ohnehin geladen
   * hat. Im Rezept stellt sie die API zusammen -- hier waere ein zweiter
   * Abruf nur Umweg.
   */
  useEffect(() => {
    if (!szene) return;
    if (!route || !trip.data) {
      szene.setzeBilanz(null, titel, schluss);
      return;
    }
    szene.setzeBilanz(
      {
        titel: trip.data.title,
        zeitraum:
          trip.data.startDate || trip.data.endDate
            ? formatDateRange(trip.data.startDate, trip.data.endDate)
            : null,
        distanzM: route.totalDistanceM,
        aufstiegM: route.totalAscentM,
        abstiegM: route.totalDescentM,
        stationen: route.legs.length,
        tage: reisetage(trip.data.startDate, trip.data.endDate),
      },
      titel,
      schluss,
    );
  }, [szene, route, trip.data, titel, schluss]);

  useEffect(() => {
    szene?.setzeDaten(daten);
  }, [szene, daten]);

  useEffect(() => {
    szene?.setzeOptionen({ marker: markerArt, gelaende, ueberhoehung, ruhigeBeschriftung });
  }, [szene, markerArt, gelaende, ueberhoehung, ruhigeBeschriftung]);

  useEffect(() => {
    if (!szene || !zustand) return;
    szene.zeichne(zustand);
    szene.nachrendern();
  }, [szene, zustand]);

  /** Abspielen. requestAnimationFrame steht im Hintergrund-Tab still – das ist
   *  fuer eine Vorschau richtig so. */
  useEffect(() => {
    if (!laeuft || !zeitachse) return;
    let letzte = performance.now();
    let id = 0;
    const schritt = (jetzt: number) => {
      const delta = (jetzt - letzte) / 1000;
      letzte = jetzt;
      setZeit((t) => {
        const neu = t + delta;
        if (neu >= zeitachse.gesamtdauer) {
          setLaeuft(false);
          return zeitachse.gesamtdauer;
        }
        return neu;
      });
      id = requestAnimationFrame(schritt);
    };
    id = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(id);
  }, [laeuft, zeitachse]);

  // --- Oberflaeche ---------------------------------------------------------

  return (
    <div className="stack">
      <div className="card stack">
        <h2>Reisevideo</h2>
        <p className="muted small">
          Vorschau der Animation. Sie laeuft mit derselben Berechnung, die ein spaeteres
          Rendern auf dem Server benutzen wuerde.
        </p>

        <div className="video-buehne">
          <div ref={setKnoten} className="video-karte" />
          {zustand && daten && (
            <div className="video-einblendung">
              <strong>{daten.etappen[zustand.etappenIndex]?.titel ?? ''}</strong>
              <span>{formatKm(zustand.gefahreneM)}</span>
            </div>
          )}
        </div>

        {calculate.isPending && !route && <Loading />}
        {calculate.error && !route && <ErrorState error={calculate.error} />}
        {!daten && !calculate.isPending && !calculate.error && (
          <p className="muted">
            Fuer die Animation braucht es eine berechnete Route mit mindestens einer Etappe.
          </p>
        )}

        {zeitachse && (
          <>
            <div className="row">
              <button type="button" className="btn" onClick={() => setLaeuft((v) => !v)}>
                {laeuft ? 'Pause' : zeit >= zeitachse.gesamtdauer ? 'Von vorn' : 'Abspielen'}
              </button>
              <input
                type="range"
                min={0}
                max={zeitachse.gesamtdauer}
                step={0.05}
                value={zeit}
                aria-label="Position im Video"
                onChange={(e) => {
                  setLaeuft(false);
                  setZeit(Number(e.target.value));
                }}
              />
              <span className="badge">
                {zeit.toFixed(1)} / {zeitachse.gesamtdauer.toFixed(1)} s
              </span>
            </div>

            {daten && (
              <div className="stack">
                <h3>Kamera und Tempo</h3>
                <p className="muted small">
                  Ohne gesetzte Punkte fliegt die Kamera die ganze Reise auf derselben Hoehe
                  und im selben Tempo. Ein Punkt haelt Hoehe, Neigung und Tempo an einer
                  Stelle der Strecke fest; dazwischen wird weich ueberblendet, nie gesprungen.
                  Die Punkte haengen an der Strecke, nicht an der Zeit.
                </p>

                <div className="row">
                  <button type="button" className="btn btn--small" onClick={setzeKamerapunkt}>
                    Punkt bei {formatKm(zustand?.gefahreneM ?? 0)} setzen
                  </button>
                  {kameraPunkte.length > 0 && (
                    <button
                      type="button"
                      className="btn btn--small btn--ghost"
                      onClick={() => aendereEinstellungen({ kameraPunkte: [] })}
                    >
                      Alle verwerfen
                    </button>
                  )}
                </div>

                {kameraPunkte.length === 0 ? (
                  <p className="muted small">
                    Noch keine Punkte. Schiebe die Vorschau an die gewuenschte Stelle und setze
                    dort einen Punkt – Hoehe, Neigung und Tempo stellst du dann daran ein.
                  </p>
                ) : (
                  <div className="stack">
                    {kameraPunkte.map((punkt, i) => (
                      <div className="card card--flach stack" key={i}>
                        <div className="row row--between">
                          <button
                            type="button"
                            className="btn btn--small btn--ghost"
                            onClick={() => springeZu(punkt.anteil)}
                            title="Vorschau an diese Stelle setzen"
                          >
                            {formatKm(punkt.anteil * daten.track.laengeM)}
                          </button>
                          <button
                            type="button"
                            className="btn btn--small btn--danger"
                            onClick={() => entferneKamerapunkt(i)}
                          >
                            Entfernen
                          </button>
                        </div>
                        <div className="grid grid--3">
                          <div className="field">
                            <label htmlFor={`kp-zoom-${i}`}>Hoehe</label>
                            <input
                              id={`kp-zoom-${i}`}
                              type="range"
                              min={5}
                              max={13}
                              step={0.25}
                              value={punkt.zoom}
                              onChange={(e) =>
                                aendereKamerapunkt(i, { zoom: Number(e.target.value) })
                              }
                            />
                            <span className="field__hint">Zoomstufe {punkt.zoom}</span>
                          </div>
                          <div className="field">
                            <label htmlFor={`kp-neigung-${i}`}>Neigung</label>
                            <input
                              id={`kp-neigung-${i}`}
                              type="range"
                              min={0}
                              max={80}
                              step={1}
                              value={punkt.neigung}
                              onChange={(e) =>
                                aendereKamerapunkt(i, { neigung: Number(e.target.value) })
                              }
                            />
                            <span className="field__hint">{punkt.neigung}°</span>
                          </div>
                          <div className="field">
                            <label htmlFor={`kp-tempo-${i}`}>Tempo</label>
                            <input
                              id={`kp-tempo-${i}`}
                              type="range"
                              min={0.25}
                              max={4}
                              step={0.25}
                              value={punkt.tempo}
                              onChange={(e) =>
                                aendereKamerapunkt(i, { tempo: Number(e.target.value) })
                              }
                            />
                            <span className="field__hint">{punkt.tempo}×</span>
                          </div>
                        </div>
                        <div className="grid grid--2">
                          <div className="field">
                            <label htmlFor={`kp-drehung-${i}`}>Blickrichtung</label>
                            <input
                              id={`kp-drehung-${i}`}
                              type="range"
                              min={0}
                              max={1}
                              step={0.1}
                              value={punkt.drehung}
                              onChange={(e) =>
                                aendereKamerapunkt(i, { drehung: Number(e.target.value) })
                              }
                            />
                            <span className="field__hint">
                              {punkt.drehung === 0
                                ? 'Norden oben'
                                : punkt.drehung === 1
                                  ? 'dreht mit dem Fahrzeug'
                                  : `${Math.round(punkt.drehung * 100)} % mitgedreht`}
                            </span>
                          </div>
                          <div className="field">
                            <label htmlFor={`kp-halt-${i}`}>Pause hier</label>
                            <input
                              id={`kp-halt-${i}`}
                              type="range"
                              min={0}
                              max={10}
                              step={0.5}
                              value={punkt.halt}
                              onChange={(e) =>
                                aendereKamerapunkt(i, { halt: Number(e.target.value) })
                              }
                            />
                            <span className="field__hint">
                              {punkt.halt === 0 ? 'faehrt durch' : `${punkt.halt} s stehen bleiben`}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {daten && halteStationen.length > 0 && (
              <div className="stack">
                <h3>Halt je Station</h3>
                <p className="muted small">
                  Wie lange das Video an einer Station stehen bleibt. Eine 0 faehrt
                  durch, ohne Schild. Der Startpunkt fehlt hier – dort faengt das
                  Video an, statt stehen zu bleiben.
                </p>
                {halteStationen.map((i) => {
                  const station = daten.stationen[i]!;
                  const wert = einstellungen.haltProStation[i] ?? einstellungen.haltSekunden;
                  return (
                    <div className="row row--between" key={i}>
                      <span className="truncate">
                        {station.name}{' '}
                        <span className="small muted">
                          {formatKm(station.anteil * daten.track.laengeM)}
                        </span>
                      </span>
                      <span className="row">
                        <input
                          type="range"
                          min={0}
                          max={10}
                          step={0.5}
                          value={wert}
                          aria-label={`Halt an ${station.name}`}
                          onChange={(e) => setzeStationHalt(i, Number(e.target.value))}
                        />
                        <span className="badge">{wert} s</span>
                        {(fotosJeStation.get(i)?.length ?? 0) > 0 && (
                          <select
                            aria-label={`Foto an ${station.name}`}
                            value={einstellungen.fotoProStation[i] ?? ''}
                            onChange={(e) => setzeStationFoto(i, e.target.value || null)}
                          >
                            <option value="">ohne Foto</option>
                            {fotosJeStation.get(i)!.map((foto, n) => (
                              <option key={foto.id} value={foto.id}>
                                {foto.caption?.slice(0, 40) || `${foto.spot} – Bild ${n + 1}`}
                              </option>
                            ))}
                          </select>
                        )}
                      </span>
                    </div>
                  );
                })}
                {spots.data && fotosJeStation.size === 0 && (
                  <p className="muted small">
                    Fuer ein Foto im Video braucht es einen Stellplatz mit Bild in der Naehe
                    der Station.
                  </p>
                )}
              </div>
            )}

            <div className="grid grid--2">
              <div className="field">
                <label htmlFor="video-stil">Kartenstil</label>
                <select id="video-stil" value={stil} onChange={(e) => setStil(e.target.value as StilArt)}>
                  {Object.entries(STILE).map(([wert, name]) => (
                    <option key={wert} value={wert}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="video-marker">Marker</label>
                <select
                  id="video-marker"
                  value={markerArt}
                  onChange={(e) => setMarkerArt(e.target.value as MarkerArt)}
                >
                  {Object.entries(MARKER_NAMEN).map(([wert, name]) => (
                    <option key={wert} value={wert}>{name}</option>
                  ))}
                </select>
              </div>


            </div>

            <div className="grid grid--2">
              <div className="field">
                <label htmlFor="video-tempo">Sekunden je 100 km</label>
                <input
                  id="video-tempo"
                  type="number"
                  min={1}
                  max={30}
                  step={0.5}
                  value={einstellungen.sekundenProHundertKm}
                  onChange={(e) =>
                    setEinstellungen({ ...einstellungen, sekundenProHundertKm: Number(e.target.value) })
                  }
                />
                <span className="field__hint">
                  Grundtempo der ganzen Reise. Die Punkte oben rechnen darauf ihren Faktor –
                  2× heisst halb so viele Sekunden je 100 km.
                </span>
              </div>
              <div className="field">
                <label htmlFor="video-halt">Halt je Station (s)</label>
                <input
                  id="video-halt"
                  type="number"
                  min={0}
                  max={10}
                  step={0.5}
                  value={einstellungen.haltSekunden}
                  onChange={(e) =>
                    setEinstellungen({ ...einstellungen, haltSekunden: Number(e.target.value) })
                  }
                />
              </div>
            </div>

            <div className="grid grid--2">
              <div className="field">
                <label htmlFor="video-zoom">Kamerahoehe bei der Fahrt</label>
                <input
                  id="video-zoom"
                  type="range"
                  min={5}
                  max={13}
                  step={0.25}
                  value={einstellungen.fahrtZoom}
                  onChange={(e) =>
                    setEinstellungen({ ...einstellungen, fahrtZoom: Number(e.target.value) })
                  }
                />
                <span className="field__hint">
                  Zoomstufe {einstellungen.fahrtZoom} – kleiner heisst hoeher und weiter weg
                  {kameraPunkte.length > 0 && '. Gilt nur noch fuer neue Kamerapunkte.'}
                </span>
              </div>
              <div className="field">
                <label htmlFor="video-haltzoom">Kamerahoehe beim Halt</label>
                <input
                  id="video-haltzoom"
                  type="range"
                  min={5}
                  max={15}
                  step={0.25}
                  value={einstellungen.haltZoom}
                  onChange={(e) =>
                    setEinstellungen({ ...einstellungen, haltZoom: Number(e.target.value) })
                  }
                />
                <span className="field__hint">Zoomstufe {einstellungen.haltZoom}</span>
              </div>
            </div>

            <div className="field">
              <label htmlFor="video-neigung">Neigung</label>
              <input
                id="video-neigung"
                type="range"
                min={0}
                max={80}
                step={1}
                value={einstellungen.neigung}
                onChange={(e) =>
                  setEinstellungen({ ...einstellungen, neigung: Number(e.target.value) })
                }
              />
              <span className="field__hint">
                {einstellungen.neigung}° – 0 blickt senkrecht nach unten, groessere Werte zeigen
                mehr Gelaende
                {kameraPunkte.length > 0 && '. Gilt nur noch fuer neue Kamerapunkte.'}
              </span>
            </div>

            <div className="row">
              <button
                type="button"
                className="chip"
                aria-pressed={gelaende}
                onClick={() => setGelaende((v) => !v)}
              >
                3D-Gelaende
              </button>
              <button
                type="button"
                className="chip"
                aria-pressed={ruhigeBeschriftung}
                onClick={() => setRuhigeBeschriftung((v) => !v)}
                title="Blendet Doerfer, Strassennamen und Punkte am Wegesrand aus"
              >
                Ruhige Beschriftung
              </button>
            </div>

            {gelaende && (
              <div className="field">
                <label htmlFor="video-ueberhoehung">Ueberhoehung des Gelaendes</label>
                <input
                  id="video-ueberhoehung"
                  type="range"
                  min={1}
                  max={8}
                  step={0.5}
                  value={ueberhoehung}
                  onChange={(e) => setUeberhoehung(Number(e.target.value))}
                />
                <span className="field__hint">
                  {ueberhoehung}× – echte Hoehen wirken aus der Luft flach. Mittelgebirge
                  brauchen deutlich mehr als das Doppelte, um sich abzuzeichnen.
                </span>
              </div>
            )}

            <div>
              <button
                type="button"
                className="chip"
                aria-pressed={einstellungen.kameraDrehtMit}
                onClick={() =>
                  setEinstellungen({ ...einstellungen, kameraDrehtMit: !einstellungen.kameraDrehtMit })
                }
              >
                Kamera dreht mit
              </button>
            </div>

          </>
        )}
      </div>

      {zeitachse && rendererDa && (
        <div className="card stack">
          <h2>Video erzeugen</h2>
          <p className="muted small">
            Gerendert wird auf dem Server, Bild fuer Bild mit genau diesen Einstellungen. Das
            dauert ein Vielfaches der Videolaenge – du kannst die Seite waehrenddessen
            verlassen, der Auftrag laeuft weiter.
          </p>

          <div className="grid grid--2">
            <div className="field">
              <label htmlFor="video-groesse">Aufloesung</label>
              <select
                id="video-groesse"
                value={groesse}
                onChange={(e) => setGroesse(e.target.value as keyof typeof VIDEO_GROESSEN)}
                disabled={laeuftGerade}
              >
                {Object.keys(VIDEO_GROESSEN).map((wert) => {
                  const { breite, hoehe } = videoAufloesung(
                    wert as keyof typeof VIDEO_GROESSEN,
                  );
                  return (
                    <option key={wert} value={wert}>
                      {wert} ({breite}×{hoehe})
                    </option>
                  );
                })}
              </select>
              <span className="field__hint">
                {groesse === '4k'
                  ? 'Derselbe Bildausschnitt wie die anderen Stufen, nur feiner gezeichnet. ' +
                    'Kostet rund die anderthalbfache Renderzeit von 1080p und ergibt eine ' +
                    'etwa drei Mal so grosse Datei.'
                  : 'Alle Stufen zeigen denselben Kartenausschnitt – hoehere Aufloesung ' +
                    'heisst nur schaerfer und laenger, nie mehr Karte.'}
              </span>
            </div>
            <div className="field">
              <label htmlFor="video-fps">Bilder je Sekunde</label>
              <input
                id="video-fps"
                type="range"
                min={12}
                max={30}
                step={1}
                value={bilderProSekunde}
                onChange={(e) => setBilderProSekunde(Number(e.target.value))}
                disabled={laeuftGerade}
              />
              <span className="field__hint">
                {bilderProSekunde} – jedes Bild ist ein eigenes Foto, doppelt so viele Bilder
                heisst doppelt so lange rendern.
              </span>
            </div>
          </div>

          <div className="row">
            <button
              type="button"
              className="chip"
              aria-pressed={titel}
              onClick={() => setTitel((v) => !v)}
            >
              Titeltafel
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={schluss}
              onClick={() => setSchluss((v) => !v)}
            >
              Schlussbilanz
            </button>
          </div>
          <div className="field">
            <label htmlFor="video-musik">Musik</label>
            <select
              id="video-musik"
              value={musik ?? ''}
              onChange={(e) => setMusik(e.target.value || null)}
              disabled={laeuftGerade}
            >
              <option value="">ohne Musik</option>
              {eigeneMusik.data?.vorhanden && <option value="eigene">eigene Datei</option>}
              {musikStuecke.map((stueck) => (
                <option key={stueck.datei} value={`auswahl:${stueck.datei}`}>
                  {stueck.titel}
                  {stueck.urheber ? ` – ${stueck.urheber}` : ''}
                </option>
              ))}
            </select>
            <span className="field__hint">
              <MusikUpload tripId={tripId} vorhanden={eigeneMusik.data?.vorhanden ?? false} />
            </span>
          </div>

          {musik && (
            <div className="field">
              <label htmlFor="video-lautstaerke">Lautstaerke</label>
              <input
                id="video-lautstaerke"
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={musikLautstaerke}
                onChange={(e) => setMusikLautstaerke(Number(e.target.value))}
                disabled={laeuftGerade}
              />
              <span className="field__hint">{Math.round(musikLautstaerke * 100)} %</span>
            </div>
          )}

          <p className="muted small">
            Titel und Bilanz liegen im Vor- und Abspann – sie verlaengern das Video nicht,
            sondern fuellen die Zeit, in der die Kamera ohnehin heran- oder wegfliegt.
          </p>

          <p className="muted small">
            {zeitachse.gesamtdauer.toFixed(1)} s Video ergeben{' '}
            <strong>{bilderGesamt.toLocaleString('de-DE')} Bilder</strong>.
          </p>

          {auftrag.error && <ErrorState error={auftrag.error} />}
          {starten.error && <ErrorState error={starten.error} />}

          {laeuftGerade && auftrag.data && (
            <div className="stack">
              <progress
                max={auftrag.data.bilderGesamt || bilderGesamt}
                value={auftrag.data.bilder}
                className="video-fortschritt"
              />
              <span className="small muted">
                {auftrag.data.status === 'wartend'
                  ? 'Wartet auf den Renderer …'
                  : `Bild ${auftrag.data.bilder.toLocaleString('de-DE')} von ${(
                      auftrag.data.bilderGesamt || bilderGesamt
                    ).toLocaleString('de-DE')}`}
              </span>
              <div>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => loeschen.mutate()}
                  disabled={loeschen.isPending}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          {auftrag.data?.status === 'fehler' && (
            <p className="alert alert--error">
              Das Rendern ist gescheitert: {auftrag.data.fehler ?? 'unbekannter Fehler'}
            </p>
          )}

          {auftrag.data?.status === 'fertig' && (
            <div className="row row--between">
              <span className="small muted">
                Fertig: {auftrag.data.dauerS.toFixed(1)} s,{' '}
                {(auftrag.data.bytes / 1024 / 1024).toFixed(1)} MB
              </span>
              <span className="row">
                <a
                  className="btn"
                  href={`/api/trips/${tripId}/video/datei`}
                  download={`reisevideo-${tripId}.mp4`}
                >
                  Herunterladen
                </a>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => loeschen.mutate()}
                  disabled={loeschen.isPending}
                >
                  Verwerfen
                </button>
              </span>
            </div>
          )}

          {!laeuftGerade && (
            <div>
              <button
                type="button"
                className="btn"
                onClick={() => starten.mutate(rezept)}
                disabled={starten.isPending}
              >
                {auftrag.data?.status === 'fertig' ? 'Neu erzeugen' : 'Video erzeugen'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Auf die Schrittweite des Reglers runden, damit er den Wert auch anzeigt. */
function runde(wert: number, schritt: number): number {
  return Math.round(wert / schritt) * schritt;
}

/**
 * Reisetage einschliesslich An- und Abreisetag -- dieselbe Rechnung wie in der
 * API, damit Vorschau und Video dieselbe Zahl zeigen.
 */
function reisetage(von: string | null, bis: string | null): number | null {
  if (!von || !bis) return null;
  const tag = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.round((Date.parse(bis) - Date.parse(von)) / tag) + 1);
}
