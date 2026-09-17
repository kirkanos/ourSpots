import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AMENITIES,
  AMENITY_LABELS,
  SPOT_TYPES,
  SPOT_TYPE_LABELS,
  type Amenity,
  type SpotType,
} from '@ourspots/shared';
import { useSpots, useTrips, type SpotFilters } from '../api/hooks';
import { photoUrl } from '../api/hooks';
import { StarRating } from '../components/StarRating';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { IconPlus } from '../components/Icons';
import { formatDate, formatMoney } from '../lib/format';

export function SpotsPage() {
  const [filters, setFilters] = useState<SpotFilters>({ sort: 'visitedAt', order: 'desc', limit: 100 });
  const [showFilters, setShowFilters] = useState(false);
  const trips = useTrips();
  const spots = useSpots(filters);

  const patch = (next: Partial<SpotFilters>) => setFilters((prev) => ({ ...prev, ...next }));

  const toggleAmenity = (amenity: Amenity) => {
    const current = filters.amenities ?? [];
    patch({
      amenities: current.includes(amenity)
        ? current.filter((a) => a !== amenity)
        : [...current, amenity],
    });
  };

  const activeFilterCount =
    (filters.type ? 1 : 0) +
    (filters.minRating ? 1 : 0) +
    (filters.maxPrice !== undefined ? 1 : 0) +
    (filters.tripId ? 1 : 0) +
    (filters.amenities?.length ?? 0);

  return (
    <div className="page stack">
      <div className="row row--between">
        <h1>Stellplätze</h1>
        <Link to="/stellplaetze/neu" className="btn btn--small">
          <IconPlus />
          Neu
        </Link>
      </div>

      <input
        type="search"
        value={filters.q ?? ''}
        onChange={(e) => patch({ q: e.target.value || undefined })}
        placeholder="Nach Name, Adresse oder Notiz suchen"
        aria-label="Stellplätze durchsuchen"
      />

      <div className="row row--between">
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
        >
          Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
        <div className="row small">
          <label htmlFor="sort" className="muted" style={{ marginBottom: 0 }}>
            Sortierung
          </label>
          <select
            id="sort"
            value={`${filters.sort}:${filters.order}`}
            onChange={(e) => {
              const [sort, order] = e.target.value.split(':');
              patch({ sort, order });
            }}
            style={{ width: 'auto' }}
          >
            <option value="visitedAt:desc">Zuletzt besucht</option>
            <option value="visitedAt:asc">Zuerst besucht</option>
            <option value="rating:desc">Beste Bewertung</option>
            <option value="name:asc">Name A–Z</option>
            <option value="createdAt:desc">Zuletzt angelegt</option>
          </select>
        </div>
      </div>

      {showFilters && (
        <div className="card stack">
          <div className="grid grid--2">
            <div className="field">
              <label htmlFor="filter-type">Art</label>
              <select
                id="filter-type"
                value={filters.type ?? ''}
                onChange={(e) => patch({ type: (e.target.value as SpotType) || undefined })}
              >
                <option value="">Alle</option>
                {SPOT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {SPOT_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="filter-trip">Reise</label>
              <select
                id="filter-trip"
                value={filters.tripId ?? ''}
                onChange={(e) => patch({ tripId: e.target.value || undefined })}
              >
                <option value="">Alle</option>
                {trips.data?.map((trip) => (
                  <option key={trip.id} value={trip.id}>
                    {trip.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="filter-rating">Mindestbewertung</label>
              <select
                id="filter-rating"
                value={filters.minRating ?? ''}
                onChange={(e) => patch({ minRating: e.target.value ? Number(e.target.value) : undefined })}
              >
                <option value="">Egal</option>
                {[5, 4, 3, 2].map((n) => (
                  <option key={n} value={n}>
                    {n} Sterne und besser
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="filter-price">Höchstpreis pro Nacht (€)</label>
              <input
                id="filter-price"
                type="number"
                min={0}
                step="1"
                value={filters.maxPrice ?? ''}
                onChange={(e) => patch({ maxPrice: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="egal"
              />
            </div>
          </div>

          <fieldset>
            <label>Ausstattung</label>
            <div className="row">
              {AMENITIES.map((amenity) => (
                <button
                  key={amenity}
                  type="button"
                  className="chip"
                  aria-pressed={filters.amenities?.includes(amenity) ?? false}
                  onClick={() => toggleAmenity(amenity)}
                >
                  {AMENITY_LABELS[amenity]}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setFilters({ sort: 'visitedAt', order: 'desc', limit: 100 })}
            >
              Filter zurücksetzen
            </button>
          </div>
        </div>
      )}

      {spots.isPending && <Loading />}
      {spots.error && <ErrorState error={spots.error} onRetry={() => void spots.refetch()} />}

      {spots.data && spots.data.items.length === 0 && (
        <EmptyState
          title="Keine Treffer"
          description={
            activeFilterCount > 0 || filters.q
              ? 'Mit diesen Filtern gibt es nichts. Setze sie zurück oder suche anders.'
              : 'Leg deinen ersten Stellplatz an – unterwegs geht das mit einem Tippen auf „Erfassen“.'
          }
          action={
            <Link to="/stellplaetze/neu" className="btn">
              Stellplatz anlegen
            </Link>
          }
        />
      )}

      {spots.data && spots.data.items.length > 0 && (
        <>
          <p className="muted small">
            {spots.data.total} {spots.data.total === 1 ? 'Stellplatz' : 'Stellplätze'}
          </p>
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {spots.data.items.map((spot) => (
              <li key={spot.id}>
                <Link to={`/stellplaetze/${spot.id}`} className="card card--link row" style={{ gap: '0.9rem' }}>
                  {spot.photos[0] ? (
                    <img
                      src={photoUrl(spot.photos[0].id, 'thumb')}
                      alt=""
                      width={72}
                      height={72}
                      loading="lazy"
                      style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }}
                    />
                  ) : (
                    <div
                      aria-hidden
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--surface-alt)',
                      }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row row--between">
                      <strong className="truncate">{spot.name}</strong>
                      <StarRating value={spot.rating} />
                    </div>
                    <div className="small muted truncate">
                      {SPOT_TYPE_LABELS[spot.type]}
                      {spot.address ? ` · ${spot.address}` : ''}
                    </div>
                    <div className="row small muted" style={{ marginTop: '0.25rem' }}>
                      <span>{formatDate(spot.visitedAt)}</span>
                      {spot.pricePerNight != null && (
                        <span className="badge">{formatMoney(spot.pricePerNight, spot.currency)}</span>
                      )}
                      {spot.amenities.slice(0, 2).map((amenity) => (
                        <span className="badge" key={amenity}>
                          {AMENITY_LABELS[amenity]}
                        </span>
                      ))}
                      {spot.amenities.length > 2 && (
                        <span className="badge">+{spot.amenities.length - 2}</span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
