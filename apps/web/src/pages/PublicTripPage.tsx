import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Marker, Polyline, Popup } from 'react-leaflet';
import { AMENITY_LABELS, SPOT_TYPE_LABELS, type PublicTripDto } from '@womo/shared';
import { api } from '../api/client';
import { BaseMap } from '../components/map/BaseMap';
import { spotIcon, waypointIcon } from '../components/map/markerIcons';
import { StarRating } from '../components/StarRating';
import { EmptyState, Loading } from '../components/States';
import { IconLogo } from '../components/Icons';
import { formatDate, formatDateRange, formatMoney } from '../lib/format';

/**
 * Öffentliche Ansicht einer geteilten Reise – ohne Anmeldung, nur lesend.
 * Private Notizen filtert bereits der Server heraus.
 */
export function PublicTripPage() {
  const { token } = useParams();
  const [trip, setTrip] = useState<PublicTripDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api<PublicTripDto>(`/public/${token}`)
      .then(setTrip)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Die Reise konnte nicht geladen werden'),
      );
  }, [token]);

  if (error) {
    return (
      <div className="page">
        <EmptyState
          title="Dieser Link führt ins Leere"
          description="Er wurde widerrufen, ist abgelaufen oder hat nie existiert. Frage die Person, die ihn dir geschickt hat, nach einem neuen."
        />
      </div>
    );
  }

  if (!trip) return <Loading label="Reise wird geladen …" />;

  const points: [number, number][] = [
    ...trip.waypoints.map((wp) => [wp.lat, wp.lon] as [number, number]),
    ...trip.spots.map((spot) => [spot.lat, spot.lon] as [number, number]),
  ];
  const line = trip.waypoints.map((wp) => [wp.lat, wp.lon] as [number, number]);

  return (
    <div className="app">
      <header className="app__header">
        <span className="app__brand">
          <IconLogo />
          WoMoPlaner
        </span>
        <div className="app__spacer" />
        <span className="badge">geteilte Ansicht</span>
      </header>

      <main className="page stack">
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>{trip.title}</h1>
          <div className="small muted">
            {formatDateRange(trip.startDate, trip.endDate)} · geteilt von {trip.ownerName}
          </div>
        </div>

        {trip.description && <p>{trip.description}</p>}

        {points.length > 0 && (
          <div className="map-embed map-embed--tall">
            <BaseMap bounds={points}>
              {line.length > 1 && (
                <Polyline positions={line} pathOptions={{ color: '#1f6f5c', weight: 3, dashArray: '6 8' }} />
              )}
              {trip.waypoints.map((wp, index) => (
                <Marker
                  key={`wp-${index}`}
                  position={[wp.lat, wp.lon]}
                  icon={waypointIcon(index + 1, wp.kind)}
                />
              ))}
              {trip.spots.map((spot) => (
                <Marker key={spot.id} position={[spot.lat, spot.lon]} icon={spotIcon(spot.type, spot.rating)}>
                  <Popup>
                    <strong>{spot.name}</strong>
                    <div className="small muted">{SPOT_TYPE_LABELS[spot.type]}</div>
                  </Popup>
                </Marker>
              ))}
            </BaseMap>
          </div>
        )}

        <h2>Stellplätze</h2>
        {trip.spots.length === 0 && <p className="muted">Zu dieser Reise ist kein Stellplatz erfasst.</p>}

        <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {trip.spots.map((spot) => (
            <li key={spot.id} className="card stack">
              <div className="row row--between">
                <strong>{spot.name}</strong>
                <StarRating value={spot.rating} />
              </div>
              <div className="row small muted">
                <span className="badge">{SPOT_TYPE_LABELS[spot.type]}</span>
                <span>{formatDate(spot.visitedAt)}</span>
                {spot.pricePerNight != null && (
                  <span className="badge">{formatMoney(spot.pricePerNight)}</span>
                )}
              </div>

              {spot.amenities.length > 0 && (
                <div className="row">
                  {spot.amenities.map((amenity) => (
                    <span className="badge" key={amenity}>
                      {AMENITY_LABELS[amenity]}
                    </span>
                  ))}
                </div>
              )}

              {spot.notes && <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{spot.notes}</p>}

              {spot.photoIds.length > 0 && (
                <div className="gallery">
                  {spot.photoIds.map((photoId) => (
                    <a
                      key={photoId}
                      href={`/api/public/${token}/photos/${photoId}?size=original`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={`/api/public/${token}/photos/${photoId}?size=thumb`}
                        alt={`Foto von ${spot.name}`}
                        loading="lazy"
                      />
                    </a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
