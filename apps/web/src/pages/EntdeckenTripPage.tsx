import { useParams } from 'react-router-dom';
import { usePublicTrip } from '../api/hooks';
import { EmptyState, Loading } from '../components/States';
import { OeffentlicheReise } from './PublicTripPage';

/**
 * Eine oeffentlich freigegebene Reise, ueber ihre Kennung aufgerufen.
 *
 * Dieselbe Darstellung wie der Teilen-Link, nur eine andere Datenquelle: Hier
 * gibt es kein Token, die Reise ist schlicht als oeffentlich markiert. Was
 * ausgeliefert wird, entscheidet der Server -- Notizen sind nie dabei.
 */
export function EntdeckenTripPage() {
  const { id } = useParams();
  const trip = usePublicTrip(id ?? '');

  if (trip.isPending) return <Loading label="Reise wird geladen …" />;

  if (trip.error || !trip.data) {
    return (
      <div className="page">
        <EmptyState
          title="Diese Reise gibt es hier nicht"
          description="Sie wurde nicht öffentlich geteilt oder inzwischen wieder zurückgezogen."
        />
      </div>
    );
  }

  return (
    <OeffentlicheReise
      trip={trip.data}
      hinweis="öffentliche Reise"
      herkunft={`von ${trip.data.ownerName}`}
      fotoUrl={(photoId) => `/api/entdecken/photos/${photoId}`}
    />
  );
}
