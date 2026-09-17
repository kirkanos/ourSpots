import { Link, useNavigate, useParams } from 'react-router-dom';
import { Marker } from 'react-leaflet';
import { AMENITY_LABELS, SPOT_TYPE_LABELS } from '@ourspots/shared';
import { useDeleteSpot, useMe, useSpot, useTrips } from '../api/hooks';
import { BaseMap } from '../components/map/BaseMap';
import { spotIcon } from '../components/map/markerIcons';
import { PhotoGallery } from '../components/PhotoGallery';
import { StarRating } from '../components/StarRating';
import { ErrorState, Loading } from '../components/States';
import { formatCoords, formatDate, formatMoney } from '../lib/format';

export function SpotDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const spot = useSpot(id);
  const me = useMe();
  const trips = useTrips();
  const remove = useDeleteSpot();

  if (spot.isPending) return <Loading />;
  if (spot.error) return <div className="page"><ErrorState error={spot.error} /></div>;
  if (!spot.data) return null;

  const data = spot.data;
  const trip = trips.data?.find((t) => t.id === data.tripId);
  // Bearbeiten darf der Ersteller; bei Reise-Stellplätzen zusätzlich jeder,
  // der in der Reise Schreibrechte hat.
  const editable =
    data.createdById === me.data?.id || (trip ? trip.myRole !== 'viewer' : false);

  const handleDelete = () => {
    if (!window.confirm(`„${data.name}“ wirklich löschen? Das lässt sich nicht rückgängig machen.`)) {
      return;
    }
    remove.mutate(data.id, { onSuccess: () => navigate('/stellplaetze') });
  };

  return (
    <div className="page stack">
      <div className="row row--between">
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>{data.name}</h1>
          <div className="row small muted">
            <span className="badge">{SPOT_TYPE_LABELS[data.type]}</span>
            <StarRating value={data.rating} />
          </div>
        </div>
        {editable && (
          <div className="row">
            <Link to={`/stellplaetze/${data.id}/bearbeiten`} className="btn btn--ghost btn--small">
              Bearbeiten
            </Link>
            <button type="button" className="btn btn--danger btn--small" onClick={handleDelete}>
              Löschen
            </button>
          </div>
        )}
      </div>

      <div style={{ height: '220px', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <BaseMap center={[data.lat, data.lon]} zoom={14}>
          <Marker position={[data.lat, data.lon]} icon={spotIcon(data.type, data.rating)} />
        </BaseMap>
      </div>

      <div className="card stack">
        <dl className="grid grid--2" style={{ margin: 0 }}>
          <Fact label="Übernachtet am" value={formatDate(data.visitedAt)} />
          <Fact label="Nächte" value={data.nights != null ? String(data.nights) : '–'} />
          <Fact label="Preis pro Nacht" value={formatMoney(data.pricePerNight, data.currency)} />
          <Fact label="Reise" value={trip ? trip.title : 'Keiner Reise zugeordnet'} />
          <Fact label="Adresse" value={data.address ?? '–'} />
          <Fact label="Koordinaten" value={formatCoords(data.lat, data.lon)} />
        </dl>

        <div className="row">
          <a
            className="btn btn--ghost btn--small"
            href={`https://www.openstreetmap.org/?mlat=${data.lat}&mlon=${data.lon}#map=16/${data.lat}/${data.lon}`}
            target="_blank"
            rel="noreferrer"
          >
            In OpenStreetMap öffnen
          </a>
          <a
            className="btn btn--ghost btn--small"
            href={`geo:${data.lat},${data.lon}?q=${data.lat},${data.lon}(${encodeURIComponent(data.name)})`}
          >
            Navigation starten
          </a>
        </div>
      </div>

      {data.amenities.length > 0 && (
        <div className="card">
          <h2>Ausstattung</h2>
          <div className="row">
            {data.amenities.map((amenity) => (
              <span className="badge badge--accent" key={amenity}>
                {AMENITY_LABELS[amenity]}
              </span>
            ))}
          </div>
        </div>
      )}

      {data.notes && (
        <div className="card">
          <h2>
            Notizen{' '}
            {data.isPrivateNote && <span className="badge">privat</span>}
          </h2>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{data.notes}</p>
        </div>
      )}

      <div className="card">
        <h2>Fotos</h2>
        <PhotoGallery spotId={data.id} photos={data.photos} editable={editable} />
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="small muted">{label}</dt>
      <dd style={{ margin: 0 }}>{value}</dd>
    </div>
  );
}
