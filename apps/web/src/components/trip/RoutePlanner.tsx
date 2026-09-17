import { useEffect, useMemo, useState } from 'react';
import { Marker, Polyline } from 'react-leaflet';
import {
  decodePolyline,
  ROUTE_PREFERENCES,
  type RouteOptions,
  type StageDto,
  type TripRouteDto,
  type WaypointDto,
  type WaypointInput,
} from '@ourspots/shared';
import {
  useCalculateRoute,
  useCachedRoute,
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
import { IconPlus, IconRoute, IconTrash } from '../Icons';
import { formatDuration, formatKm } from '../../lib/format';

const PREFERENCE_LABELS: Record<(typeof ROUTE_PREFERENCES)[number], string> = {
  recommended: 'Empfohlen',
  fastest: 'Schnellste',
  shortest: 'Kürzeste',
};

/** Farben der Teilrouten, damit Etappen auf der Karte unterscheidbar sind. */
const LEG_COLORS = ['#1f6f5c', '#2f6f9e', '#9e6b2f', '#7a3f8f', '#2f9e7e', '#b3261e'];

interface Props {
  tripId: string;
  canEdit: boolean;
}

export function RoutePlanner({ tripId, canEdit }: Props) {
  const stored = useWaypoints(tripId);
  const stages = useStages(tripId);
  const saveWaypoints = useSaveWaypoints(tripId);
  const saveStages = useSaveStages(tripId);
  const routing = useRoutingStatus();
  const calculate = useCalculateRoute(tripId);
  const optimize = useOptimizeRoute(tripId);
  const cachedRoute = useCachedRoute(tripId);

  const [draft, setDraft] = useState<WaypointInput[]>([]);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showStages, setShowStages] = useState(false);
  const [options, setOptions] = useState<Partial<RouteOptions>>({
    preference: 'recommended',
    avoidTollways: false,
    avoidFerries: false,
    avoidHighways: false,
  });
  const [proposal, setProposal] = useState<{ ids: string[]; savedM: number } | null>(null);

  useEffect(() => {
    if (stored.data && !dirty) setDraft(stored.data.map(toInput));
  }, [stored.data, dirty]);

  const route: TripRouteDto | undefined = calculate.data ?? cachedRoute;

  const legLines = useMemo(
    () => (route?.legs ?? []).map((leg) => decodePolyline(leg.geometry)),
    [route],
  );

  const straightLine = draft.map((wp) => [wp.lat, wp.lon] as [number, number]);
  const mapBounds =
    legLines.length > 0 && legLines[0]!.length > 0
      ? legLines.flat()
      : straightLine.length > 1
        ? straightLine
        : undefined;

  const reorder = (next: WaypointInput[]) =>
    next.map((wp, i) => ({ ...wp, seq: i, kind: kindFor(i, next.length) }));

  const move = (index: number, delta: number) => {
    const next = [...draft];
    const target = index + delta;
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    setDraft(reorder(next));
    setDirty(true);
  };

  const applyProposal = () => {
    if (!proposal) return;
    const byId = new Map(draft.filter((wp) => wp.id).map((wp) => [wp.id!, wp]));
    const next = proposal.ids
      .map((wpId) => byId.get(wpId))
      .filter((wp): wp is WaypointInput => wp !== undefined);
    setDraft(reorder(next));
    setDirty(true);
    setProposal(null);
  };

  return (
    <div className="stack">
      <div className="card stack">
        <div className="row row--between">
          <h2>Route und Zwischenziele</h2>
          {canEdit && (
            <div className="row">
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setShowStages((v) => !v)}>
                Etappen
              </button>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setAdding((v) => !v)}>
                <IconPlus />
                Ziel
              </button>
            </div>
          )}
        </div>

        {stored.isPending && <Loading />}

        {draft.length > 0 && (
          <div className="map-embed">
            <BaseMap bounds={mapBounds} center={straightLine[0]} zoom={7}>
              {draft.map((wp, index) => (
                <Marker
                  key={wp.id ?? `${wp.lat},${wp.lon},${index}`}
                  position={[wp.lat, wp.lon]}
                  icon={waypointIcon(index + 1, wp.kind ?? 'via')}
                />
              ))}

              {legLines.length > 0
                ? legLines.map((line, index) => (
                    <Polyline
                      key={index}
                      positions={line}
                      pathOptions={{ color: LEG_COLORS[index % LEG_COLORS.length], weight: 5, opacity: 0.85 }}
                    />
                  ))
                : straightLine.length > 1 && (
                    // Vor der Berechnung nur eine Hilfslinie – gestrichelt, damit
                    // niemand sie für die Fahrstrecke hält.
                    <Polyline
                      positions={straightLine}
                      pathOptions={{ color: '#8a9490', weight: 3, dashArray: '6 8' }}
                    />
                  )}
            </BaseMap>
          </div>
        )}

        {draft.length === 0 && !adding && (
          <p className="muted">
            Noch keine Ziele. Füge Start, Zwischenziele und Ziel hinzu – die Reihenfolge lässt sich
            danach ändern.
          </p>
        )}

        {adding && (
          <WaypointAdder
            onAdd={(value) => {
              setDraft(reorder([...draft, { ...value, seq: draft.length, kind: 'via', locked: false }]));
              setDirty(true);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        )}

        {showStages && canEdit && (
          <StageEditor
            stages={stages.data ?? []}
            saving={saveStages.isPending}
            error={saveStages.error}
            onSave={(next) => saveStages.mutate(next)}
          />
        )}

        <ol className="waypoints">
          {draft.map((wp, index) => (
            <li key={wp.id ?? `${wp.lat},${wp.lon},${index}`}>
              <div className="row row--between">
                <div style={{ minWidth: 0 }}>
                  <div className="truncate">
                    <strong>{wp.name}</strong>{' '}
                    <span className="badge">
                      {wp.kind === 'start' ? 'Start' : wp.kind === 'end' ? 'Ziel' : 'Zwischenziel'}
                    </span>
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
                          const next = [...draft];
                          next[index] = { ...wp, stageId: e.target.value || null };
                          setDraft(next);
                          setDirty(true);
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
                        const next = [...draft];
                        next[index] = { ...wp, locked: !wp.locked };
                        setDraft(next);
                        setDirty(true);
                      }}
                    >
                      {wp.locked ? '🔒' : '🔓'}
                    </button>
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
                      aria-label="Ziel entfernen"
                      onClick={() => {
                        setDraft(reorder(draft.filter((_, i) => i !== index)));
                        setDirty(true);
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
              {saveWaypoints.isPending ? 'Wird gespeichert …' : 'Ziele speichern'}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setDraft((stored.data ?? []).map(toInput));
                setDirty(false);
              }}
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
            disabled={calculate.isPending || draft.length < 2 || dirty}
            onClick={() => calculate.mutate(options)}
          >
            <IconRoute />
            {calculate.isPending ? 'Wird berechnet …' : 'Route berechnen'}
          </button>

          {canEdit && (
            <button
              type="button"
              className="btn btn--ghost"
              disabled={optimize.isPending || draft.length < 4 || dirty}
              title="Sucht eine kürzere Reihenfolge der Zwischenziele"
              onClick={() =>
                optimize.mutate(
                  {},
                  {
                    onSuccess: (result) =>
                      setProposal({ ids: result.waypointIds, savedM: result.savedM }),
                  },
                )
              }
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

        {dirty && (
          <p className="small muted">
            Erst die geänderten Ziele speichern – sonst würde die Route zur alten Reihenfolge
            berechnet.
          </p>
        )}

        {calculate.error && <ErrorState error={calculate.error} />}
        {optimize.error && <ErrorState error={optimize.error} />}

        {proposal && (
          <div className="alert stack">
            <strong>Vorschlag für eine neue Reihenfolge</strong>
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

function StageEditor({
  stages,
  saving,
  error,
  onSave,
}: {
  stages: StageDto[];
  saving: boolean;
  error: unknown;
  onSave: (stages: { id?: string; seq: number; title: string | null; date: string | null }[]) => void;
}) {
  // Neue Etappen haben noch keine ID – die vergibt der Server beim Speichern.
  type DraftStage = { id?: string; seq: number; title: string | null; date: string | null };
  const [draft, setDraft] = useState<DraftStage[]>(() =>
    stages.map((stage) => ({ id: stage.id, seq: stage.seq, title: stage.title, date: stage.date })),
  );

  return (
    <div className="card stack" style={{ background: 'var(--surface-alt)' }}>
      <h3>Etappen</h3>
      <p className="small muted">
        Mit Etappen wird die Reise in Tagesabschnitte zerlegt; jede bekommt eine eigene Route.
        Ohne Etappen entsteht eine durchgehende Strecke.
      </p>

      {draft.map((stage, index) => (
        <div className="row" key={stage.id ?? index}>
          <input
            aria-label={`Titel der Etappe ${index + 1}`}
            value={stage.title ?? ''}
            placeholder={`Etappe ${index + 1}`}
            onChange={(e) => {
              const next = [...draft];
              next[index] = { ...stage, title: e.target.value || null };
              setDraft(next);
            }}
          />
          <input
            type="date"
            aria-label={`Datum der Etappe ${index + 1}`}
            value={stage.date ?? ''}
            style={{ width: 'auto' }}
            onChange={(e) => {
              const next = [...draft];
              next[index] = { ...stage, date: e.target.value || null };
              setDraft(next);
            }}
          />
          <button
            type="button"
            className="btn btn--danger btn--small"
            aria-label="Etappe entfernen"
            onClick={() => setDraft(draft.filter((_, i) => i !== index).map((s, i) => ({ ...s, seq: i })))}
          >
            <IconTrash />
          </button>
        </div>
      ))}

      {error != null && <ErrorState error={error} />}

      <div className="row">
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => setDraft([...draft, { seq: draft.length, title: null, date: null }])}
        >
          <IconPlus />
          Etappe
        </button>
        <button type="button" className="btn btn--small" disabled={saving} onClick={() => onSave(draft)}>
          {saving ? 'Wird gespeichert …' : 'Etappen speichern'}
        </button>
      </div>
    </div>
  );
}

function WaypointAdder({
  onAdd,
  onCancel,
}: {
  onAdd: (value: { name: string; lat: number; lon: number; address: string | null }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [position, setPosition] = useState<{ lat: number; lon: number; address: string | null } | null>(null);

  return (
    <div className="card stack" style={{ background: 'var(--surface-alt)' }}>
      <div className="field">
        <label htmlFor="wp-name">Bezeichnung</label>
        <input
          id="wp-name"
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
            onAdd({
              name: name.trim() || position.address?.split(',')[0]?.trim() || 'Zwischenziel',
              lat: position.lat,
              lon: position.lon,
              address: position.address,
            });
            setName('');
            setPosition(null);
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

function stageTitle(stages: StageDto[], stageId: string | null): string {
  if (!stageId) return 'ohne Etappe';
  const stage = stages.find((s) => s.id === stageId);
  return stage ? (stage.title ?? `Etappe ${stage.seq + 1}`) : 'ohne Etappe';
}

/** Erster Punkt ist Start, letzter ist Ziel, alles dazwischen Zwischenziel. */
function kindFor(index: number, total: number): 'start' | 'via' | 'end' {
  if (index === 0) return 'start';
  if (index === total - 1) return 'end';
  return 'via';
}
