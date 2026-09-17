import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Popup, Marker } from 'react-leaflet';
import { SPOT_TYPE_LABELS, type SpotDto } from '@womo/shared';
import { BaseMap } from '../components/map/BaseMap';
import { ClusterLayer } from '../components/map/ClusterLayer';
import { crosshairIcon } from '../components/map/markerIcons';
import { StarRating } from '../components/StarRating';
import { IconCrosshair, IconPlus } from '../components/Icons';
import { useSpots, type SpotFilters } from '../api/hooks';
import { formatDate } from '../lib/format';

export function MapPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<SpotDto | null>(null);
  const [myPosition, setMyPosition] = useState<[number, number] | null>(null);
  const [query, setQuery] = useState('');

  // Ohne bbox-Filter: die Gesamtmenge ist für einen privaten Bestand klein
  // genug, und so bleibt die Karte beim Verschieben ruhig statt nachzuladen.
  const filters: SpotFilters = useMemo(() => ({ q: query || undefined, limit: 500 }), [query]);
  const spots = useSpots(filters);
  const items = spots.data?.items ?? [];

  const locate = () => {
    navigator.geolocation?.getCurrentPosition(
      (position) => setMyPosition([position.coords.latitude, position.coords.longitude]),
      () => setMyPosition(null),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <div className="page page--flush">
      <div className="map-page">
        <div className="map-overlay">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`${items.length} Stellplätze durchsuchen`}
            aria-label="Stellplätze durchsuchen"
            style={{ boxShadow: 'var(--shadow)' }}
          />
          <button
            type="button"
            className="btn btn--ghost"
            onClick={locate}
            aria-label="Meinen Standort zeigen"
            style={{ background: 'var(--surface)' }}
          >
            <IconCrosshair />
          </button>
        </div>

        <BaseMap center={myPosition ?? undefined} zoom={myPosition ? 13 : undefined}>
          <ClusterLayer spots={items} onSelect={setSelected} />
          {myPosition && <Marker position={myPosition} icon={crosshairIcon()} />}
          {selected && (
            <Popup
              position={[selected.lat, selected.lon]}
              eventHandlers={{ remove: () => setSelected(null) }}
            >
              <strong>{selected.name}</strong>
              <div className="small muted">
                {SPOT_TYPE_LABELS[selected.type]}
                {selected.visitedAt ? ` · ${formatDate(selected.visitedAt)}` : ''}
              </div>
              <div style={{ margin: '0.35rem 0' }}>
                <StarRating value={selected.rating} />
              </div>
              <button
                type="button"
                className="btn btn--small"
                onClick={() => navigate(`/stellplaetze/${selected.id}`)}
              >
                Details
              </button>
            </Popup>
          )}
        </BaseMap>

        <button type="button" className="btn map-fab" onClick={() => navigate('/erfassen')}>
          <IconPlus />
          Hier bin ich
        </button>
      </div>
    </div>
  );
}
