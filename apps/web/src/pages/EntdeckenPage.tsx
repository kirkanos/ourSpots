import { Link } from 'react-router-dom';
import { useMe, usePublicTrips } from '../api/hooks';
import { IconLogo } from '../components/Icons';
import { ErrorState, Loading } from '../components/States';
import { formatDateRange, formatKm } from '../lib/format';

/**
 * Die Reisen, die ohne Anmeldung sichtbar sind.
 *
 * Bewusst die Eingangstuer fuer alle, die nicht angemeldet sind: Wer die
 * Adresse aufruft, landet hier statt vor einem Anmeldefenster. Privat bleibt
 * trotzdem die Voreinstellung -- hier erscheint nur, was jemand ausdruecklich
 * freigegeben hat.
 */
export function EntdeckenPage() {
  const trips = usePublicTrips();
  // Angemeldete bekommen den Weg zurueck in die App statt eines
  // Anmeldeknopfs, den sie nicht brauchen.
  const me = useMe();

  return (
    <div className="app">
      <header className="app__header">
        <span className="app__brand">
          <IconLogo />
          OurSpots
        </span>
        <div className="app__spacer" />
        {me.data ? (
          <Link className="btn btn--small btn--ghost" to="/karte">
            Zur App
          </Link>
        ) : (
          <a className="btn btn--small" href="/api/auth/login?returnTo=%2Fkarte">
            Anmelden
          </a>
        )}
      </header>

      <main className="page stack">
      <div className="stack">
        <h1>Reisen entdecken</h1>
        <p className="muted">
          Öffentlich geteilte Wohnmobil-Reisen mit Route, Stationen und Fotos.
        </p>
      </div>

      {trips.isPending && <Loading />}
      {trips.error && <ErrorState error={trips.error} />}

      {trips.data?.length === 0 && (
        <div className="card">
          <p className="muted">
            Hier ist noch nichts öffentlich. Wer angemeldet ist, kann eigene Reisen in den
            Reisedaten freigeben.
          </p>
        </div>
      )}

      <div className="grid grid--2">
        {trips.data?.map((trip) => (
          <Link className="card card--link stack" to={`/entdecken/${trip.id}`} key={trip.id}>
            <h2>{trip.title}</h2>
            <div className="row">
              {(trip.startDate || trip.endDate) && (
                <span className="badge">{formatDateRange(trip.startDate, trip.endDate)}</span>
              )}
              {trip.distanceM !== null && (
                <span className="badge badge--accent">{formatKm(trip.distanceM)}</span>
              )}
              {trip.spotCount > 0 && (
                <span className="badge">{trip.spotCount} Stellplätze</span>
              )}
            </div>
            {trip.description && <p className="muted">{trip.description}</p>}
            <p className="small muted">von {trip.ownerName}</p>
          </Link>
        ))}
        </div>
      </main>
    </div>
  );
}
