import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Marker } from 'react-leaflet';
import {
  TRIP_STATUSES,
  TRIP_STATUS_LABELS,
  tripInputSchema,
  type TripDto,
  type TripInput,
  type TripStatus,
} from '@ourspots/shared';
import {
  useAddTripMember,
  useDeleteTrip,
  useMe,
  useRemoveTripMember,
  useSaveTrip,
  useSpots,
  useTrip,
  useVehicles,
} from '../api/hooks';
import { BaseMap } from '../components/map/BaseMap';
import { spotIcon } from '../components/map/markerIcons';
import { RoutePlanner } from '../components/trip/RoutePlanner';
import { TripJournal } from '../components/trip/TripJournal';
import { TripStats } from '../components/trip/TripStats';
import { SharePanel } from '../components/trip/SharePanel';
import { ErrorState, Loading } from '../components/States';
import { IconPlus, IconTrash } from '../components/Icons';
import { formatDate, formatDateRange } from '../lib/format';

const TABS = [
  { key: 'route', label: 'Route' },
  { key: 'plaetze', label: 'Stellplätze' },
  { key: 'tagebuch', label: 'Tagebuch' },
  { key: 'kosten', label: 'Kosten' },
  { key: 'teilen', label: 'Teilen' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function TripDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const trip = useTrip(id);
  const me = useMe();

  const tab = (params.get('tab') as TabKey | null) ?? 'route';

  if (trip.isPending) return <Loading />;
  if (trip.error) {
    return (
      <div className="page">
        <ErrorState error={trip.error} />
      </div>
    );
  }
  if (!trip.data || !id) return null;

  const canEdit = trip.data.myRole !== 'viewer';
  const isOwner = trip.data.myRole === 'owner';
  // Teilen-Links darf nur der Eigentümer verwalten.
  const visibleTabs = TABS.filter((entry) => entry.key !== 'teilen' || isOwner);

  return (
    <div className="page stack">
      <div className="row row--between">
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>{trip.data.title}</h1>
          <div className="row small muted">
            <span className={`badge${trip.data.status === 'active' ? ' badge--accent' : ''}`}>
              {TRIP_STATUS_LABELS[trip.data.status]}
            </span>
            <span>{formatDateRange(trip.data.startDate, trip.data.endDate)}</span>
            {trip.data.myRole !== 'owner' && <span className="badge">geteilt mit dir</span>}
          </div>
        </div>
        {isOwner && (
          <DeleteTripButton tripId={id} title={trip.data.title} onDeleted={() => navigate('/reisen')} />
        )}
      </div>

      {trip.data.description && <p className="muted">{trip.data.description}</p>}

      {canEdit && <TripSettings tripId={id} trip={trip.data} />}

      <div className="tabs" role="tablist">
        {visibleTabs.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={tab === entry.key}
            className="tabs__tab"
            onClick={() => setParams({ tab: entry.key }, { replace: true })}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'route' && <RoutePlanner tripId={id} canEdit={canEdit} />}
      {tab === 'plaetze' && <TripSpots tripId={id} />}
      {tab === 'tagebuch' && <TripJournal tripId={id} canEdit={canEdit} />}
      {tab === 'kosten' && <TripStats tripId={id} />}
      {tab === 'teilen' && isOwner && <SharePanel tripId={id} />}

      {isOwner && tab === 'teilen' && (
        <MemberSettings tripId={id} members={trip.data.members ?? []} meId={me.data?.id} />
      )}
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

function TripSettings({ tripId, trip }: { tripId: string; trip: TripDto }) {
  const save = useSaveTrip();
  const vehicles = useVehicles();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TripInput>({
    title: trip.title,
    description: trip.description,
    startDate: trip.startDate,
    endDate: trip.endDate,
    status: trip.status,
    vehicleId: trip.vehicleId,
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
      <div className="row">
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpen(true)}>
          Reisedaten bearbeiten
        </button>
        {trip.vehicleId && vehicles.data && (
          <span className="badge">
            {vehicles.data.find((v) => v.id === trip.vehicleId)?.name ?? 'Fahrzeug'}
          </span>
        )}
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
          <label htmlFor="edit-vehicle">Fahrzeug</label>
          <select
            id="edit-vehicle"
            value={form.vehicleId ?? ''}
            onChange={(e) => setForm({ ...form, vehicleId: e.target.value || null })}
          >
            <option value="">Kein Fahrzeug</option>
            {vehicles.data?.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.name}
              </option>
            ))}
          </select>
          <div className="field__hint">
            Die Maße des Fahrzeugs fließen in die Routenberechnung ein. Anlegen unter{' '}
            <Link to="/einstellungen">Einstellungen</Link>.
          </div>
        </div>
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
        <div className="map-embed">
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
                {member.role === 'owner'
                  ? 'Eigentümer'
                  : member.role === 'editor'
                    ? 'darf bearbeiten'
                    : 'nur lesen'}
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
