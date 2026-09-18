import { useEffect, useMemo, useState } from 'react';
import { Marker, Polyline } from 'react-leaflet';
import {
  decodePolyline,
  ROUTE_PREFERENCES,
  type HomeDto,
  type OptimizeResultDto,
  type RouteOptions,
  type StageDto,
  type TripRouteDto,
  type WaypointDto,
  type WaypointInput,
} from '@ourspots/shared';
import {
  useCalculateRoute,
  useCachedRoute,
  useMe,
  useOptimizeRoute,
  useRoutingStatus,
  useSaveStages,
  useSaveWaypoints,
  useStages,
  useWaypoints,
} from '../../api/hooks';
import { BaseMap } from '../map/BaseMap';
import { waypointIcon } from '../map/markerIcons';
import { LocationField } from '../LocationField';
import { ErrorState, Loading } from '../States';
import { IconHome, IconPlus, IconRoute, IconTrash } from '../Icons';
import { formatCoords, formatDuration, formatKm } from '../../lib/format';

const PREFERENCE_LABELS: Record<(typeof ROUTE_PREFERENCES)[number], string> = {
  recommended: 'Empfohlen',
  fastest: 'Schnellste',
  shortest: 'Kürzeste',
};

/** Farben der Teilrouten, damit Etappen auf der Karte unterscheidbar sind. */
const LEG_COLORS = ['#1f6f5c', '#2f6f9e', '#9e6b2f', '#7a3f8f', '#2f9e7e', '#b3261e'];

/** Etappe im Bearbeitungszustand – neue haben noch keine ID vom Server. */
interface DraftStage {
  id?: string;
  seq: number;
  title: string | null;
  date: string | null;
  lat: number | null;
  lon: number | null;
  address: string | null;
}

interface Props {
  tripId: string;
  canEdit: boolean;
}

export function RoutePlanner({ tripId, canEdit }: Props) {
  const me = useMe();
  const stored = useWaypoints(tripId);
  const stages = useStages(tripId);
  const saveWaypoints = useSaveWaypoints(tripId);
  const saveStages = useSaveStages(tripId);
  const routing = useRoutingStatus();
  const calculate = useCalculateRoute(tripId);
  const optimize = useOptimizeRoute(tripId);
  const cachedRoute = useCachedRoute(tripId);

  // Start, Zwischenziele und Ziel liegen getrennt im State. Gespeichert werden
  // sie weiterhin als eine sortierte Wegpunktliste – aber in der Bedienung
  // sind Start und Ziel damit feste Plätze und nicht bloß der erste und letzte
  // Eintrag einer Liste, in der sie versehentlich verrutschen können.
  const [start, setStart] = useState<WaypointInput | null>(null);
  const [vias, setVias] = useState<WaypointInput[]>([]);
  const [end, setEnd] = useState<WaypointInput | null>(null);
  const [dirty, setDirty] = useState(false);

  const [stageDraft, setStageDraft] = useState<DraftStage[]>([]);
  const [stagesDirty, setStagesDirty] = useState(false);

  const [editing, setEditing] = useState<'start' | 'end' | 'via' | null>(null);
  const [showStages, setShowStages] = useState(false);
  const [options, setOptions] = useState<Partial<RouteOptions>>({
    preference: 'recommended',
    avoidTollways: false,
    avoidFerries: false,
    avoidHighways: false,
  });
  const [proposal, setProposal] = useState<OptimizeResultDto | null>(null);

  const home = me.data?.home ?? null;

  useEffect(() => {
    if (!stored.data || dirty) return;
    const list = stored.data.map(toInput);
    setStart(list[0] ?? null);
    setEnd(list.length > 1 ? (list[list.length - 1] ?? null) : null);
    setVias(list.length > 2 ? list.slice(1, -1) : []);
  }, [stored.data, dirty]);

  useEffect(() => {
    if (!stages.data || stagesDirty) return;
    setStageDraft(stages.data.map(toDraftStage));
  }, [stages.data, stagesDirty]);

  /** Die Wegpunktliste, wie sie gespeichert wird. */
  const draft: WaypointInput[] = useMemo(() => {
    const list = [...(start ? [start] : []), ...vias, ...(end ? [end] : [])];
    return list.map((wp, index) => ({
      ...wp,
      seq: index,
      kind: wp === start ? 'start' : wp === end ? 'end' : 'via',
    }));
  }, [start, vias, end]);

  const stageStops = stageDraft.filter(
    (stage): stage is DraftStage & { lat: number; lon: number } =>
      stage.lat !== null && stage.lon !== null,
  );

  const route: TripRouteDto | undefined = calculate.data ?? cachedRoute;

  const legLines = useMemo(
    () => (route?.legs ?? []).map((leg) => decodePolyline(leg.geometry)),
    [route],
  );

  // Vorschau der geplanten Reihenfolge: Über die Rastorte der Etappen, wenn es
  // welche gibt – sonst über die freien Zwischenziele.
  const previewLine: [number, number][] = [
    ...(start ? [[start.lat, start.lon] as [number, number]] : []),
    ...(stageStops.length > 0
      ? stageStops.map((stage) => [stage.lat, stage.lon] as [number, number])
      : vias.map((wp) => [wp.lat, wp.lon] as [number, number])),
    ...(end ? [[end.lat, end.lon] as [number, number]] : []),
  ];

  const mapBounds =
    legLines.length > 0 && legLines[0]!.length > 0
      ? legLines.flat()
      : previewLine.length > 1
        ? previewLine
        : undefined;

  const markDirty = () => setDirty(true);

  /** Setzt einen Punkt und behält dabei dessen bisherige ID – so bleiben
   *  Etappenzuordnung und Routen-Zwischenspeicher erhalten. */
  const place = (
    previous: WaypointInput | null,
    value: { name: string; lat: number; lon: number; address: string | null },
  ): WaypointInput => ({
    id: previous?.id,
    stageId: previous?.stageId ?? null,
    seq: previous?.seq ?? 0,
    kind: previous?.kind ?? 'via',
    locked: previous?.locked ?? false,
    plannedArrival: previous?.plannedArrival ?? null,
    plannedNights: previous?.plannedNights ?? null,
    ...value,
  });

  const takeHome = (slot: 'start' | 'end') => {
    if (!home) return;
    const value = { name: home.name, lat: home.lat, lon: home.lon, address: home.address };
    if (slot === 'start') setStart((prev) => place(prev, value));
    else setEnd((prev) => place(prev, value));
    markDirty();
  };

  const applyProposal = () => {
    if (!proposal) return;
    if (proposal.target === 'stages') {
      const byId = new Map(stageDraft.filter((s) => s.id).map((s) => [s.id!, s]));
      const next = proposal.stageIds
        .map((id) => byId.get(id))
        .filter((stage): stage is DraftStage => stage !== undefined);
      setStageDraft(next.map((stage, index) => ({ ...stage, seq: index })));
      setStagesDirty(true);
      setShowStages(true);
    } else {
      const byId = new Map(vias.filter((wp) => wp.id).map((wp) => [wp.id!, wp]));
      const next = proposal.waypointIds
        .map((id) => byId.get(id))
        .filter((wp): wp is WaypointInput => wp !== undefined);
      setVias(next);
      markDirty();
    }
    setProposal(null);
  };

  const moveVia = (index: number, delta: number) => {
    const next = [...vias];
    const a = next[index];
    const b = next[index + delta];
    if (!a || !b) return;
    next[index] = b;
    next[index + delta] = a;
    setVias(next);
    markDirty();
  };

  /** Optimieren lohnt erst, wenn es überhaupt etwas umzusortieren gibt. */
  const canOptimize = stageStops.length >= 2 ? Boolean(start && end) : vias.length >= 2;

  return (
    <div className="stack">
      <div className="card stack">
        <div className="row row--between">
          <h2>Start und Ziel</h2>
          {canEdit && (
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setShowStages((v) => !v)}>
              Etappen
            </button>
          )}
        </div>

        {stored.isPending && <Loading />}

        <div className="grid grid--2">
          <EndpointCard
            label="Start"
            point={start}
            home={home}
            canEdit={canEdit}
            editing={editing === 'start'}
            onTakeHome={() => takeHome('start')}
            onEdit={() => setEditing(editing === 'start' ? null : 'start')}
            onChange={(value) => {
              setStart((prev) => place(prev, value));
              setEditing(null);
              markDirty();
            }}
            onClear={() => {
              setStart(null);
              markDirty();
            }}
          />
          <EndpointCard
            label="Ziel"
            point={end}
            home={home}
            canEdit={canEdit}
            editing={editing === 'end'}
            onTakeHome={() => takeHome('end')}
            onEdit={() => setEditing(editing === 'end' ? null : 'end')}
            onChange={(value) => {
              setEnd((prev) => place(prev, value));
              setEditing(null);
              markDirty();
            }}
            onClear={() => {
              setEnd(null);
              markDirty();
            }}
            extra={
              canEdit && start ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  title="Für eine Rundreise: zurück zum Ausgangspunkt"
                  onClick={() => {
                    // Bewusst ohne ID kopiert – Start und Ziel sind zwei
                    // Wegpunkte, auch wenn sie an derselben Stelle liegen.
                    setEnd((prev) =>
                      place(prev, {
                        name: start.name,
                        lat: start.lat,
                        lon: start.lon,
                        address: start.address ?? null,
                      }),
                    );
                    markDirty();
                  }}
                >
                  Wie Start
                </button>
              ) : null
            }
          />
        </div>

        {!home && canEdit && (
          <p className="small muted">
            Hinterlege dein Zuhause in den Einstellungen, dann steht es hier für Start und Ziel auf
            Knopfdruck bereit.
          </p>
        )}

        {previewLine.length > 0 && (
          <div className="map-embed">
            <BaseMap bounds={mapBounds} center={previewLine[0]} zoom={7}>
              {start && <Marker position={[start.lat, start.lon]} icon={waypointIcon(1, 'start')} />}
              {stageStops.map((stage, index) => (
                <Marker
                  key={stage.id ?? `stage-${index}`}
                  position={[stage.lat, stage.lon]}
                  icon={waypointIcon(index + 1, 'stage')}
                />
              ))}
              {vias.map((wp, index) => (
                <Marker
                  key={wp.id ?? `${wp.lat},${wp.lon},${index}`}
                  position={[wp.lat, wp.lon]}
                  icon={waypointIcon(index + 1, 'via')}
                />
              ))}
              {end && <Marker position={[end.lat, end.lon]} icon={waypointIcon(previewLine.length, 'end')} />}

              {legLines.length > 0
                ? legLines.map((line, index) => (
                    <Polyline
                      key={index}
                      positions={line}
                      pathOptions={{ color: LEG_COLORS[index % LEG_COLORS.length], weight: 5, opacity: 0.85 }}
                    />
                  ))
                : previewLine.length > 1 && (
                    // Vor der Berechnung nur eine Hilfslinie – gestrichelt, damit
                    // niemand sie für die Fahrstrecke hält.
                    <Polyline
                      positions={previewLine}
                      pathOptions={{ color: '#8a9490', weight: 3, dashArray: '6 8' }}
                    />
                  )}
            </BaseMap>
          </div>
        )}

        {showStages && canEdit && (
          <StageEditor
            draft={stageDraft}
            dirty={stagesDirty}
            saving={saveStages.isPending}
            error={saveStages.error}
            onChange={(next) => {
              setStageDraft(next);
              setStagesDirty(true);
            }}
            onSave={() =>
              saveStages.mutate(stageDraft, { onSuccess: () => setStagesDirty(false) })
            }
            onDiscard={() => {
              setStageDraft((stages.data ?? []).map(toDraftStage));
              setStagesDirty(false);
            }}
          />
        )}

        {/* --- Freie Zwischenziele ------------------------------------------ */}

        <div className="row row--between">
          <h3>Zwischenziele</h3>
          {canEdit && (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setEditing(editing === 'via' ? null : 'via')}
            >
              <IconPlus />
              Zwischenziel
            </button>
          )}
        </div>
        <p className="small muted">
          Stopps, die zu keiner Etappe gehören – etwa eine Fähre oder ein Tankstopp. Die Rastorte
          der Reise selbst legst du besser als Etappen an.
        </p>

        {editing === 'via' && (
          <PointForm
            onSubmit={(value) => {
              setVias([...vias, place(null, value)]);
              setEditing(null);
              markDirty();
            }}
            onCancel={() => setEditing(null)}
          />
        )}

        {vias.length === 0 && editing !== 'via' && (
          <p className="muted small">Keine Zwischenziele.</p>
        )}

        <ol className="waypoints">
          {vias.map((wp, index) => (
            <li key={wp.id ?? `${wp.lat},${wp.lon},${index}`}>
              <div className="row row--between">
                <div style={{ minWidth: 0 }}>
                  <div className="truncate">
                    <strong>{wp.name}</strong>
                    {wp.locked && <span className="badge badge--accent">fest</span>}
                  </div>
                  <div className="small muted truncate">
                    {stageTitle(stages.data ?? [], wp.stageId ?? null)}
                    {wp.address ? ` · ${wp.address}` : ''}
                  </div>
                </div>

                {canEdit && (
                  <div className="row">
                    {(stages.data?.length ?? 0) > 0 && (
                      <select
                        aria-label={`Etappe für ${wp.name}`}
                        className="select--compact"
                        value={wp.stageId ?? ''}
                        onChange={(e) => {
                          const next = [...vias];
                          next[index] = { ...wp, stageId: e.target.value || null };
                          setVias(next);
                          markDirty();
                        }}
                      >
                        <option value="">ohne Etappe</option>
                        {stages.data?.map((stage) => (
                          <option key={stage.id} value={stage.id}>
                            {stage.title ?? `Etappe ${stage.seq + 1}`}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      aria-label={wp.locked ? 'Festlegung aufheben' : 'Position festhalten'}
                      title={
                        wp.locked
                          ? 'Wird bei der Optimierung nicht verschoben'
                          : 'Bei der Optimierung verschiebbar'
                      }
                      onClick={() => {
                        const next = [...vias];
                        next[index] = { ...wp, locked: !wp.locked };
                        setVias(next);
                        markDirty();
                      }}
                    >
                      {wp.locked ? '🔒' : '🔓'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      aria-label="Nach oben"
                      disabled={index === 0}
                      onClick={() => moveVia(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      aria-label="Nach unten"
                      disabled={index === vias.length - 1}
                      onClick={() => moveVia(index, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger btn--small"
                      aria-label="Zwischenziel entfernen"
                      onClick={() => {
                        setVias(vias.filter((_, i) => i !== index));
                        markDirty();
                      }}
                    >
                      <IconTrash />
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>

        {canEdit && dirty && (
          <div className="row">
            <button
              type="button"
              className="btn"
              disabled={saveWaypoints.isPending}
              onClick={() => saveWaypoints.mutate(draft, { onSuccess: () => setDirty(false) })}
            >
              {saveWaypoints.isPending ? 'Wird gespeichert …' : 'Start, Ziel und Zwischenziele speichern'}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setDirty(false)}
            >
              Verwerfen
            </button>
          </div>
        )}
        {saveWaypoints.error && <ErrorState error={saveWaypoints.error} />}
      </div>

      {/* --- Berechnung ----------------------------------------------------- */}

      <div className="card stack">
        <h2>Straßenroute</h2>

        {routing.data && !routing.data.configured && (
          <div className="alert">
            Für die Routenberechnung fehlt der OpenRouteService-Schlüssel. Trage <code>ORS_API_KEY</code>{' '}
            in die Konfiguration ein – ein kostenloser Schlüssel reicht.
          </div>
        )}

        <div className="grid grid--2">
          <div className="field">
            <label htmlFor="route-preference">Streckenwahl</label>
            <select
              id="route-preference"
              value={options.preference}
              onChange={(e) =>
                setOptions({ ...options, preference: e.target.value as RouteOptions['preference'] })
              }
            >
              {ROUTE_PREFERENCES.map((preference) => (
                <option key={preference} value={preference}>
                  {PREFERENCE_LABELS[preference]}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="field">
            <label>Meiden</label>
            <div className="row">
              {(
                [
                  ['avoidTollways', 'Mautstraßen'],
                  ['avoidFerries', 'Fähren'],
                  ['avoidHighways', 'Autobahnen'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className="chip"
                  aria-pressed={Boolean(options[key])}
                  onClick={() => setOptions({ ...options, [key]: !options[key] })}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="row">
          <button
            type="button"
            className="btn"
            disabled={calculate.isPending || draft.length < 2 || dirty || stagesDirty}
            onClick={() => calculate.mutate(options)}
          >
            <IconRoute />
            {calculate.isPending ? 'Wird berechnet …' : 'Route berechnen'}
          </button>

          {canEdit && (
            <button
              type="button"
              className="btn btn--ghost"
              disabled={optimize.isPending || !canOptimize || dirty || stagesDirty}
              title={
                stageStops.length >= 2
                  ? 'Sucht eine kürzere Reihenfolge der Etappen'
                  : 'Sucht eine kürzere Reihenfolge der Zwischenziele'
              }
              onClick={() => optimize.mutate({}, { onSuccess: setProposal })}
            >
              {optimize.isPending ? 'Wird gesucht …' : 'Reihenfolge optimieren'}
            </button>
          )}

          <a className="btn btn--ghost" href={`/api/trips/${tripId}/export.gpx`} download>
            GPX
          </a>
          <a className="btn btn--ghost" href={`/api/trips/${tripId}/export.kml`} download>
            KML
          </a>
        </div>

        {(dirty || stagesDirty) && (
          <p className="small muted">
            Erst die Änderungen speichern – sonst würde die Route zur alten Reihenfolge berechnet.
          </p>
        )}

        {calculate.error && <ErrorState error={calculate.error} />}
        {optimize.error && <ErrorState error={optimize.error} />}

        {proposal && (
          <div className="alert stack">
            <strong>
              Vorschlag für eine neue Reihenfolge der{' '}
              {proposal.target === 'stages' ? 'Etappen' : 'Zwischenziele'}
            </strong>
            <span>
              {proposal.savedM > 0
                ? `Das spart etwa ${formatKm(proposal.savedM)} gegenüber der jetzigen Reihenfolge.`
                : 'Die jetzige Reihenfolge ist bereits so gut wie die vorgeschlagene.'}
            </span>
            <div className="row">
              <button type="button" className="btn btn--small" onClick={applyProposal}>
                Übernehmen
              </button>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setProposal(null)}>
                Verwerfen
              </button>
            </div>
          </div>
        )}

        {route && (
          <div className="stack">
            <div className="row">
              <span className="badge badge--accent">{formatKm(route.totalDistanceM)}</span>
              <span className="badge badge--accent">{formatDuration(route.totalDurationS)}</span>
              <span className="badge">
                {route.profile === 'driving-hgv' ? 'mit Wohnmobil-Maßen' : 'ohne Fahrzeugmaße'}
              </span>
              {route.legs.every((leg) => leg.cached) && <span className="badge">aus dem Zwischenspeicher</span>}
            </div>

            {route.notes.map((note) => (
              <p className="small muted" key={note}>
                {note}
              </p>
            ))}

            {route.legs.length > 1 && (
              <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {route.legs.map((leg, index) => (
                  <li key={leg.stageId ?? index} className="row row--between">
                    <span className="row">
                      <span
                        className="legend-dot"
                        style={{ background: LEG_COLORS[index % LEG_COLORS.length] }}
                        aria-hidden
                      />
                      {leg.stageTitle ?? `Etappe ${index + 1}`}
                    </span>
                    <span className="small muted">
                      {formatKm(leg.distanceM)} · {formatDuration(leg.durationS)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Start bzw. Ziel der Reise – ein fester Platz, kein Listeneintrag. */
function EndpointCard({
  label,
  point,
  home,
  canEdit,
  editing,
  onTakeHome,
  onEdit,
  onChange,
  onClear,
  extra,
}: {
  label: string;
  point: WaypointInput | null;
  home: HomeDto | null;
  canEdit: boolean;
  editing: boolean;
  onTakeHome: () => void;
  onEdit: () => void;
  onChange: (value: { name: string; lat: number; lon: number; address: string | null }) => void;
  onClear: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="endpoint">
      <div className="row row--between">
        <span className="endpoint__label">{label}</span>
        {canEdit && (
          <div className="row">
            {home && (
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={onTakeHome}
                title={home.address ?? formatCoords(home.lat, home.lon)}
              >
                <IconHome />
                {home.name}
              </button>
            )}
            <button type="button" className="btn btn--ghost btn--small" onClick={onEdit}>
              {editing ? 'Abbrechen' : point ? 'Ändern' : 'Ort wählen'}
            </button>
            {extra}
            {point && (
              <button
                type="button"
                className="btn btn--ghost btn--small"
                aria-label={`${label} entfernen`}
                onClick={onClear}
              >
                <IconTrash />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Name und Adresse teilen sich eine Zeile – die Adresse ist lang und
          wuerde die Karte sonst allein doppelt so hoch machen. */}
      <div className="truncate">
        {point ? (
          <>
            <strong>{point.name}</strong>{' '}
            <span className="small muted">{point.address ?? formatCoords(point.lat, point.lon)}</span>
          </>
        ) : (
          <span className="small muted">Noch nicht festgelegt.</span>
        )}
      </div>

      {editing && <PointForm initial={point} onSubmit={onChange} onCancel={onEdit} />}
    </div>
  );
}

/**
 * Ort festlegen: Bezeichnung plus Position über Adresssuche, eigenen Standort
 * oder Tippen auf die Karte – alles im selben Formular.
 */
function PointForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: WaypointInput | null;
  onSubmit: (value: { name: string; lat: number; lon: number; address: string | null }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [position, setPosition] = useState<{ lat: number; lon: number; address: string | null } | null>(
    initial ? { lat: initial.lat, lon: initial.lon, address: initial.address ?? null } : null,
  );

  return (
    <div className="stack">
      <div className="field">
        <label htmlFor={`point-name-${initial?.id ?? 'neu'}`}>Bezeichnung</label>
        <input
          id={`point-name-${initial?.id ?? 'neu'}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z. B. Fähre Dagebüll"
        />
      </div>
      <LocationField
        lat={position?.lat ?? null}
        lon={position?.lon ?? null}
        address={position?.address ?? null}
        onChange={(value) =>
          setPosition((prev) => ({
            lat: value.lat,
            lon: value.lon,
            address: value.address !== undefined ? value.address : (prev?.address ?? null),
          }))
        }
      />
      <div className="row">
        <button
          type="button"
          className="btn"
          disabled={!position}
          onClick={() => {
            if (!position) return;
            onSubmit({
              // Ohne eigene Bezeichnung nimmt der erste Teil der gefundenen
              // Adresse deren Platz ein – das ist fast immer der Ortsname.
              name: name.trim() || position.address?.split(',')[0]?.trim() || 'Ziel',
              lat: position.lat,
              lon: position.lon,
              address: position.address,
            });
          }}
        >
          Übernehmen
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}

function StageEditor({
  draft,
  dirty,
  saving,
  error,
  onChange,
  onSave,
  onDiscard,
}: {
  draft: DraftStage[];
  dirty: boolean;
  saving: boolean;
  error: unknown;
  onChange: (next: DraftStage[]) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const [locating, setLocating] = useState<number | null>(null);

  const update = (index: number, patch: Partial<DraftStage>) => {
    const next = [...draft];
    const current = next[index];
    if (!current) return;
    next[index] = { ...current, ...patch };
    onChange(next);
  };

  const move = (index: number, delta: number) => {
    const next = [...draft];
    const a = next[index];
    const b = next[index + delta];
    if (!a || !b) return;
    next[index] = b;
    next[index + delta] = a;
    onChange(next.map((stage, i) => ({ ...stage, seq: i })));
  };

  return (
    <div className="card stack" style={{ background: 'var(--surface-alt)' }}>
      <h3>Etappen</h3>
      <p className="small muted">
        Eine Etappe ist ein Rastort auf dem Weg. Die Reise führt vom Start über die Etappen der
        Reihe nach zum Ziel, und jede Etappe bekommt eine eigene Teilstrecke.
      </p>

      {draft.map((stage, index) => (
        <div className="stack" key={stage.id ?? index}>
          <div className="row">
            <input
              aria-label={`Titel der Etappe ${index + 1}`}
              value={stage.title ?? ''}
              placeholder={`Etappe ${index + 1}`}
              onChange={(e) => update(index, { title: e.target.value || null })}
            />
            <input
              type="date"
              aria-label={`Datum der Etappe ${index + 1}`}
              value={stage.date ?? ''}
              style={{ width: 'auto' }}
              onChange={(e) => update(index, { date: e.target.value || null })}
            />
            <button
              type="button"
              className="btn btn--ghost btn--small"
              aria-label="Nach oben"
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              aria-label="Nach unten"
              disabled={index === draft.length - 1}
              onClick={() => move(index, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              className="btn btn--danger btn--small"
              aria-label="Etappe entfernen"
              onClick={() =>
                onChange(draft.filter((_, i) => i !== index).map((s, i) => ({ ...s, seq: i })))
              }
            >
              <IconTrash />
            </button>
          </div>

          <div className="row row--between">
            <span className="small muted truncate">
              {stage.lat !== null && stage.lon !== null
                ? (stage.address ?? formatCoords(stage.lat, stage.lon))
                : 'Kein Rastort festgelegt – diese Etappe wird übersprungen.'}
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setLocating(locating === index ? null : index)}
            >
              {locating === index ? 'Fertig' : stage.lat !== null ? 'Ort ändern' : 'Ort wählen'}
            </button>
          </div>

          {locating === index && (
            <LocationField
              lat={stage.lat}
              lon={stage.lon}
              address={stage.address}
              onChange={(value) =>
                update(index, {
                  lat: value.lat,
                  lon: value.lon,
                  address: value.address !== undefined ? value.address : stage.address,
                  // Ohne eigenen Titel benennt sich die Etappe nach ihrem Ort.
                  title: stage.title ?? value.address?.split(',')[0]?.trim() ?? null,
                })
              }
            />
          )}
        </div>
      ))}

      {error != null && <ErrorState error={error} />}

      <div className="row">
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() =>
            onChange([
              ...draft,
              { seq: draft.length, title: null, date: null, lat: null, lon: null, address: null },
            ])
          }
        >
          <IconPlus />
          Etappe
        </button>
        <button type="button" className="btn btn--small" disabled={saving || !dirty} onClick={onSave}>
          {saving ? 'Wird gespeichert …' : 'Etappen speichern'}
        </button>
        {dirty && (
          <button type="button" className="btn btn--ghost btn--small" onClick={onDiscard}>
            Verwerfen
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function toInput(wp: WaypointDto): WaypointInput {
  return {
    id: wp.id,
    stageId: wp.stageId,
    seq: wp.seq,
    kind: wp.kind,
    name: wp.name,
    lat: wp.lat,
    lon: wp.lon,
    address: wp.address,
    plannedArrival: wp.plannedArrival,
    plannedNights: wp.plannedNights,
    locked: wp.locked,
  };
}

function toDraftStage(stage: StageDto): DraftStage {
  return {
    id: stage.id,
    seq: stage.seq,
    title: stage.title,
    date: stage.date,
    lat: stage.lat,
    lon: stage.lon,
    address: stage.address,
  };
}

function stageTitle(stages: StageDto[], stageId: string | null): string {
  if (!stageId) return 'ohne Etappe';
  const stage = stages.find((s) => s.id === stageId);
  return stage ? (stage.title ?? `Etappe ${stage.seq + 1}`) : 'ohne Etappe';
}
