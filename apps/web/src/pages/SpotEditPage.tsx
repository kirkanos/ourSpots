import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { v7 as uuidv7 } from 'uuid';
import type { SpotInput } from '@ourspots/shared';
import { useSaveSpot, useSpot, useTrips } from '../api/hooks';
import { SpotForm } from '../components/SpotForm';
import { ErrorState, Loading } from '../components/States';

export function SpotEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isNew = id === undefined;

  const spot = useSpot(id);
  const trips = useTrips();
  const save = useSaveSpot();

  if (!isNew && spot.isPending) return <Loading />;
  if (!isNew && spot.error) return <div className="page"><ErrorState error={spot.error} /></div>;

  const handleSubmit = (input: SpotInput) => {
    // Die ID entsteht im Client – dieselbe Anfrage darf später gefahrlos
    // wiederholt werden, ohne einen zweiten Datensatz zu erzeugen.
    const spotId = id ?? uuidv7();
    save.mutate(
      { id: spotId, input },
      { onSuccess: (saved) => navigate(`/stellplaetze/${saved.id}`, { replace: true }) },
    );
  };

  return (
    <div className="page stack">
      <h1>{isNew ? 'Neuer Stellplatz' : 'Stellplatz bearbeiten'}</h1>
      <SpotForm
        initial={spot.data}
        trips={trips.data ?? []}
        defaultTripId={params.get('trip') ?? undefined}
        submitLabel={isNew ? 'Anlegen' : 'Speichern'}
        saving={save.isPending}
        error={save.error}
        onSubmit={handleSubmit}
        onCancel={() => navigate(-1)}
      />
    </div>
  );
}
