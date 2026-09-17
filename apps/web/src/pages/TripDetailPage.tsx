import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Marker, Polyline } from 'react-leaflet';
import {
  TRIP_STATUSES,
  TRIP_STATUS_LABELS,
  tripInputSchema,
  type TripInput,
  type TripStatus,
  type WaypointDto,
  type WaypointInput,
} from '@womo/shared';
import {
  useAddTripMember,
  useDeleteTrip,
  useMe,
  useRemoveTripMember,
  useSaveTrip,
  useSaveWaypoints,
  useSpots,
  useTrip,
  useWaypoints,
} from '../api/hooks';
import { BaseMap } from '../components/map/BaseMap';
import { spotIcon, waypointIcon } from '../components/map/markerIcons';
import { LocationField } from '../components/LocationField';
import { ErrorState, Loading } from '../components/States';
import { IconPlus, IconTrash } from '../components/Icons';
import { formatDate, formatDateRange } from '../lib/format';

export function TripDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const trip = useTrip(id);
  const me = useMe();

  if (trip.isPending) return <Loading />;
  if (trip.error) return <div className="page"><ErrorState error={trip.error} /></div>;
  if (!trip.data || !id) return null;

  const canEdit = trip.data.myRole !== 'viewer';
  const isOwner = trip.data.myRole === 'owner';

  return (
    <div className="page stack">
      <div className="row row--between">
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>{trip.data.title}</h1>
          <div className="row small muted">
            <span className="badge">{TRIP_STATUS_LABELS[trip.data.status]}</span>
            <span>{formatDateRange(trip.data.startDate, trip.data.endDate)}</span>
          </div>
        </div>
        {isOwner && <DeleteTripButton tripId={id} title={trip.data.title} onDeleted={() => navigate('/reisen')} />}
      </div>

      {canEdit && <TripSettings tripId={id} trip={trip.data} />}

      <RoutePlanner tripId={id} canEdit={canEdit} />

      <TripSpots tripId={id} />

      {isOwner && <MemberSettings tripId={id} members={trip.data.members ?? []} meId={me.data?.id} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function DeleteTripButton({
  tripId,
  title,
  onDeleted,
}: {
  tripId: string;
  title: string;
  onDeleted: () => void;
}) {
  const remove = useDeleteTrip();
  return (
    <button
      type="button"
      className="btn btn--danger btn--small"
      onClick={() => {
        if (!window.confirm(`Reise „${title}“ löschen? Zugeordnete Stellplätze bleiben erhalten.`)) return;
        remove.mutate(tripId, { onSuccess: onDeleted });
      }}
    >
      Reise löschen
    </button>
  );
}

function TripSettings({ tripId, trip }: { tripId: string; trip: { title: string; description: string | null; startDate: string | null; endDate: string | null; status: TripStatus } }) {
  const save = useSaveTrip();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TripInput>({
    title: trip.title,
    description: trip.description,
    startDate: trip.startDate,
    endDate: trip.endDate,
    status: trip.status,
    vehicleId: null,
  });
  const [issue, setIssue] = useState<string | null>(null);

  const submit = () => {
    setIssue(null);
    const parsed = tripInputSchema.safeParse(form);
    if (!parsed.success) {
      setIssue(parsed.error.issues[0]?.message ?? 'Bitte Eingaben prüfen');
      return;
    }
    save.mutate({ id: tripId, input: parsed.data }, { onSuccess: () => setOpen(false) });
  };

  if (!open) {
    return (
      <div>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpen(true)}>
          Reisedaten bearbeiten
        </button>
      </div>
    );
  }

  return (
    <div className="card stack">
      <h2>Reisedaten</h2>
      <div className="field">
        <label htmlFor="edit-title">Titel</label>
        <input id="edit-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>
      <div className="grid grid--2">
        <div className="field">
          <label htmlFor="edit-start">Beginn</label>
          <input
            id="edit-start"
            type="date"
            value={form.startDate ?? ''}
            onChange={(e) => setForm({ ...form, startDate: e.target.value || null })}
          />
        </div>
        <div className="field">
          <label htmlFor="edit-end">Ende</label>
          <input
            id="edit-end"
            type="date"
            value={form.endDate ?? ''}
            onChange={(e) => setForm({ ...form, endDate: e.target.value || null })}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="edit-status">Status</label>
        <select
          id="edit-status"
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value as TripStatus })}
        >
          {TRIP_STATUSES.map((status) => (
            <option key={status} value={status}>
              {TRIP_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="edit-description">Beschreibung</label>
        <textarea
          id="edit-description"
          value={form.description ?? ''}
          onChange={(e) => setForm({ ...form, description: e.target.value || null })}
        />
      </div>
      {issue && <div className="field__error">{issue}</div>}
      {save.error && <ErrorState error={save.error} />}
      <div className="row">
        <button type="button" className="btn" onClick={submit} disabled={save.isPending}>
          Speichern
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function RoutePlanner({ tripId, canEdit }: { tripId: string; canEdit: boolean }) {
  const stored = useWaypoints(tripId);
  const save = useSaveWaypoints(tripId);
  const [draft, setDraft] = useState<WaypointInput[]>([]);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (stored.data && !dirty) setDraft(stored.data.map(toInput));
  }, [stored.data, dirty]);

  const move = (index: number, delta: number) => {
    const next = [...draft];
    const target = index + delta;
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    setDraft(next.map((wp, i) => ({ ...wp, seq: i, kind: kindFor(i, next.length) })));
    setDirty(true);
  };

  const removeAt = (index: number) => {
    const next = draft.filter((_, i) => i !== index);
    setDraft(next.map((wp, i) => ({ ...wp, seq: i, kind: kindFor(i, next.length) })));
    setDirty(true);
  };

  const add = (value: { name: string; lat: number; lon: number; address: string | null }) => {
    const next = [...draft, { ...value, seq: draft.length, kind: 'via' as const, locked: false }];
    setDraft(next.map((wp, i) => ({ ...wp, seq: i, kind: kindFor(i, next.length) })));
    setDirty(true);
    setAdding(false);
  };

  const line = draft.map((wp) => [wp.lat, wp.lon] as [number, number]);

  return (
    <div className="card stack">
      <div className="row row--between">
        <h2>Route und Zwischenziele</h2>
        {canEdit && (
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setAdding((v) => !v)}>
            <IconPlus />
            Ziel hinzufügen
          </button>
        )}
      </div>

      {stored.isPending && <Loading />}

      {draft.length > 0 && (
        <div style={{ height: '260px', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          <BaseMap
            center={line[0]}
            zoom={7}
            bounds={line.length > 1 ? line : undefined}
          >
            {draft.map((wp, index) => (
              <Marker
                key={`${wp.lat},${wp.lon},${index}`}
                position={[wp.lat, wp.lon]}
                icon={waypointIcon(index + 1, wp.kind ?? 'via')}
              />
            ))}
            {line.length > 1 && (
              // Vorläufige Verbindung der Ziele. Die echte Straßenroute über
              // OpenRouteService kommt im nächsten Schritt hinzu.
              <Polyline positions={line} pathOptions={{ color: '#1f6f5c', weight: 3, dashArray: '6 8' }} />
            )}
          </BaseMap>
        </div>
      )}

      {draft.length > 1 && (
        <p className="small muted">
          Die gestrichelte Linie verbindet die Ziele vorläufig direkt. Die Berechnung der
          tatsächlichen Straßenroute mit Wohnmobil-Maßen folgt im nächsten Ausbauschritt.
        </p>
      )}

      {adding && (
        <WaypointAdder onAdd={add} onCancel={() => setAdding(false)} />
      )}

      {draft.length === 0 && !adding && (
        <p className="muted">
          Noch keine Ziele. Füge Start, Zwischenziele und Ziel hinzu – die Reihenfolge lässt sich
          danach ändern.
        </p>
      )}

      <ol className="stack" style={{ paddingLeft: '1.2rem', margin: 0 }}>
        {draft.map((wp, index) => (
          <li key={`${wp.lat},${wp.lon},${index}`}>
            <div className="row row--between">
              <div style={{ minWidth: 0 }}>
                <div className="truncate">
                  <strong>{wp.name}</strong>{' '}
                  <span className="badge">
                    {wp.kind === 'start' ? 'Start' : wp.kind === 'end' ? 'Ziel' : 'Zwischenziel'}
                  </span>
                </div>
                {wp.address && <div className="small muted truncate">{wp.address}</div>}
              </div>
              {canEdit && (
                <div className="row">
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
                    onClick={() => removeAt(index)}
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
            disabled={save.isPending}
            onClick={() =>
              save.mutate(draft, {
                onSuccess: () => setDirty(false),
              })
            }
          >
            {save.isPending ? 'Wird gespeichert …' : 'Reihenfolge speichern'}
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
      {save.error && <ErrorState error={save.error} />}
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

function TripSpots({ tripId }: { tripId: string }) {
  const spots = useSpots({ tripId, limit: 200, sort: 'visitedAt', order: 'asc' });
  const items = spots.data?.items ?? [];

  return (
    <div className="card stack">
      <div className="row row--between">
        <h2>Stellplätze dieser Reise</h2>
        <Link to={`/stellplaetze/neu?trip=${tripId}`} className="btn btn--ghost btn--small">
          <IconPlus />
          Hinzufügen
        </Link>
      </div>

      {spots.isPending && <Loading />}
      {items.length === 0 && !spots.isPending && (
        <p className="muted">Zu dieser Reise ist noch kein Stellplatz erfasst.</p>
      )}

      {items.length > 0 && (
        <div style={{ height: '240px', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          <BaseMap bounds={items.map((s) => [s.lat, s.lon] as [number, number])}>
            {items.map((spot) => (
              <Marker key={spot.id} position={[spot.lat, spot.lon]} icon={spotIcon(spot.type, spot.rating)} />
            ))}
          </BaseMap>
        </div>
      )}

      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((spot) => (
          <li key={spot.id}>
            <Link to={`/stellplaetze/${spot.id}`} className="row row--between" style={{ color: 'inherit' }}>
              <span className="truncate">{spot.name}</span>
              <span className="small muted">{formatDate(spot.visitedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MemberSettings({
  tripId,
  members,
  meId,
}: {
  tripId: string;
  members: { userId: string; role: string; user: { displayName: string; email: string | null } }[];
  meId: string | undefined;
}) {
  const add = useAddTripMember(tripId);
  const remove = useRemoveTripMember(tripId);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');

  return (
    <div className="card stack">
      <h2>Mitreisende</h2>

      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {members.map((member) => (
          <li key={member.userId} className="row row--between">
            <span>
              {member.user.displayName || member.user.email}
              {member.userId === meId && <span className="muted small"> (du)</span>}
            </span>
            <span className="row">
              <span className="badge">
                {member.role === 'owner' ? 'Eigentümer' : member.role === 'editor' ? 'darf bearbeiten' : 'nur lesen'}
              </span>
              {member.role !== 'owner' && (
                <button
                  type="button"
                  className="btn btn--danger btn--small"
                  aria-label="Zugriff entziehen"
                  onClick={() => remove.mutate(member.userId)}
                >
                  <IconTrash />
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="grid grid--2">
        <div className="field">
          <label htmlFor="member-email">E-Mail-Adresse</label>
          <input
            id="member-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@example.org"
          />
          <div className="field__hint">
            Die Person braucht ein Konto in deinem Authelia und muss sich einmal angemeldet haben.
          </div>
        </div>
        <div className="field">
          <label htmlFor="member-role">Rechte</label>
          <select id="member-role" value={role} onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}>
            <option value="editor">darf bearbeiten</option>
            <option value="viewer">nur lesen</option>
          </select>
        </div>
      </div>

      {add.error && <ErrorState error={add.error} />}

      <div>
        <button
          type="button"
          className="btn"
          disabled={!email || add.isPending}
          onClick={() => add.mutate({ email, role }, { onSuccess: () => setEmail('') })}
        >
          Hinzufügen
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

/** Erster Punkt ist Start, letzter ist Ziel, alles dazwischen Zwischenziel. */
function kindFor(index: number, total: number): 'start' | 'via' | 'end' {
  if (index === 0) return 'start';
  if (index === total - 1) return 'end';
  return 'via';
}
