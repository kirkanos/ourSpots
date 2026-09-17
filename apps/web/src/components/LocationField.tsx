import { useEffect, useState } from 'react';
import { Marker, useMap } from 'react-leaflet';
import { BaseMap } from './map/BaseMap';
import { crosshairIcon } from './map/markerIcons';
import { reverseGeocode, useGeocode } from '../api/hooks';
import { formatCoords } from '../lib/format';
import { IconCrosshair, IconSearch } from './Icons';

interface Props {
  lat: number | null;
  lon: number | null;
  address: string | null;
  onChange: (value: { lat: number; lon: number; address?: string | null; country?: string | null }) => void;
}

/**
 * Position festlegen – auf drei Wegen, weil je nach Situation ein anderer
 * praktisch ist: aktueller Standort (unterwegs), Adresssuche (am Schreibtisch)
 * oder Tippen auf die Karte (wenn man die Stelle sieht, aber nicht benennen
 * kann).
 */
export function LocationField({ lat, lon, address, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [gpsState, setGpsState] = useState<'idle' | 'locating' | 'error'>('idle');
  const [gpsError, setGpsError] = useState<string | null>(null);
  const results = useGeocode(searchOpen ? query : '');

  const useMyPosition = () => {
    if (!('geolocation' in navigator)) {
      setGpsState('error');
      setGpsError('Dieses Gerät liefert keine Standortdaten.');
      return;
    }
    setGpsState('locating');
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setGpsState('idle');
        onChange({ lat: latitude, lon: longitude });
        // Adresse nachreichen, aber den Punkt nicht davon abhängig machen –
        // ohne Netz gibt es keine Rückwärtssuche.
        const place = await reverseGeocode(latitude, longitude).catch(() => null);
        if (place) {
          onChange({ lat: latitude, lon: longitude, address: place.displayName, country: place.country });
        }
      },
      (err) => {
        setGpsState('error');
        setGpsError(
          err.code === err.PERMISSION_DENIED
            ? 'Der Zugriff auf den Standort wurde abgelehnt.'
            : 'Der Standort konnte nicht ermittelt werden.',
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  };

  return (
    <div className="stack">
      <div className="row">
        <button type="button" className="btn btn--ghost" onClick={useMyPosition} disabled={gpsState === 'locating'}>
          <IconCrosshair />
          {gpsState === 'locating' ? 'Standort wird ermittelt …' : 'Mein Standort'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setSearchOpen((v) => !v)}>
          <IconSearch />
          Adresse suchen
        </button>
      </div>

      {gpsError && <div className="alert alert--error small">{gpsError}</div>}

      {searchOpen && (
        <div>
          <input
            type="search"
            value={query}
            placeholder="Ort, Adresse oder Platzname"
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Adresse suchen"
          />
          <p className="field__hint">
            Die Suche läuft über OpenStreetMap/Nominatim und braucht mindestens drei Zeichen.
          </p>
          {results.isFetching && <p className="muted small">Wird gesucht …</p>}
          {results.data?.length === 0 && query.length >= 3 && (
            <p className="muted small">Keine Treffer.</p>
          )}
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {results.data?.map((place) => (
              <li key={`${place.lat},${place.lon}`}>
                <button
                  type="button"
                  className="btn btn--ghost btn--block"
                  style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  onClick={() => {
                    onChange({
                      lat: place.lat,
                      lon: place.lon,
                      address: place.displayName,
                      country: place.country,
                    });
                    setSearchOpen(false);
                    setQuery('');
                  }}
                >
                  {place.displayName}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ height: '260px', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
        <BaseMap
          center={lat !== null && lon !== null ? [lat, lon] : undefined}
          zoom={lat !== null ? 14 : undefined}
          onClick={(clickedLat, clickedLon) => onChange({ lat: clickedLat, lon: clickedLon })}
        >
          {lat !== null && lon !== null && (
            <>
              <Marker position={[lat, lon]} icon={crosshairIcon()} />
              <RecenterOn lat={lat} lon={lon} />
            </>
          )}
        </BaseMap>
      </div>

      <p className="field__hint">
        {lat !== null && lon !== null
          ? `Gewählte Position: ${formatCoords(lat, lon)}${address ? ` · ${address}` : ''}`
          : 'Noch keine Position gewählt – tippe auf die Karte oder nutze deinen Standort.'}
      </p>
    </div>
  );
}

/** Zieht die Karte nach, wenn die Position von außen gesetzt wurde. */
function RecenterOn({ lat, lon }: { lat: number; lon: number }): null {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], Math.max(map.getZoom(), 14));
  }, [map, lat, lon]);
  return null;
}
