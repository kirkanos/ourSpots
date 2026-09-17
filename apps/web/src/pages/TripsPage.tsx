import { useState } from 'react';
import { Link } from 'react-router-dom';
import { v7 as uuidv7 } from 'uuid';
import { TRIP_STATUS_LABELS, tripInputSchema, type TripStatus } from '@womo/shared';
import { useSaveTrip, useTrips } from '../api/hooks';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { IconPlus } from '../components/Icons';
import { formatDateRange } from '../lib/format';

export function TripsPage() {
  const trips = useTrips();
  const save = useSaveTrip();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [issue, setIssue] = useState<string | null>(null);

  const create = () => {
    setIssue(null);
    const parsed = tripInputSchema.safeParse({
      title,
      startDate: startDate || null,
      endDate: endDate || null,
      status: 'planned' as TripStatus,
    });
    if (!parsed.success) {
      setIssue(parsed.error.issues[0]?.message ?? 'Bitte Eingaben prüfen');
      return;
    }
    save.mutate(
      { id: uuidv7(), input: parsed.data },
      {
        onSuccess: () => {
          setCreating(false);
          setTitle('');
          setStartDate('');
          setEndDate('');
        },
      },
    );
  };

  return (
    <div className="page stack">
      <div className="row row--between">
        <h1>Reisen</h1>
        <button type="button" className="btn btn--small" onClick={() => setCreating((v) => !v)}>
          <IconPlus />
          Neue Reise
        </button>
      </div>

      {creating && (
        <div className="card stack">
          <div className="field">
            <label htmlFor="trip-title">Titel</label>
            <input
              id="trip-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z. B. Nordsee im Frühjahr"
              autoFocus
            />
          </div>
          <div className="grid grid--2">
            <div className="field">
              <label htmlFor="trip-start">Beginn</label>
              <input id="trip-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="trip-end">Ende</label>
              <input id="trip-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          {issue && <div className="field__error">{issue}</div>}
          {save.error && <ErrorState error={save.error} />}
          <div className="row">
            <button type="button" className="btn" onClick={create} disabled={save.isPending}>
              {save.isPending ? 'Wird angelegt …' : 'Reise anlegen'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setCreating(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {trips.isPending && <Loading />}
      {trips.error && <ErrorState error={trips.error} onRetry={() => void trips.refetch()} />}

      {trips.data?.length === 0 && !creating && (
        <EmptyState
          title="Noch keine Reise"
          description="Leg eine Reise an, um Route, Zwischenziele und Stellplätze an einem Ort zu haben."
          action={
            <button type="button" className="btn" onClick={() => setCreating(true)}>
              Erste Reise anlegen
            </button>
          }
        />
      )}

      <div className="grid grid--2">
        {trips.data?.map((trip) => (
          <Link key={trip.id} to={`/reisen/${trip.id}`} className="card card--link stack">
            <div className="row row--between">
              <strong>{trip.title}</strong>
              <span className={`badge${trip.status === 'active' ? ' badge--accent' : ''}`}>
                {TRIP_STATUS_LABELS[trip.status]}
              </span>
            </div>
            <div className="small muted">{formatDateRange(trip.startDate, trip.endDate)}</div>
            <div className="row small muted">
              <span className="badge">
                {trip.spotCount} {trip.spotCount === 1 ? 'Stellplatz' : 'Stellplätze'}
              </span>
              {trip.myRole !== 'owner' && <span className="badge">geteilt mit dir</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
