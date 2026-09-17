import { useState, type FormEvent } from 'react';
import {
  SPOT_TYPES,
  SPOT_TYPE_LABELS,
  spotInputSchema,
  type Amenity,
  type SpotDto,
  type SpotInput,
  type SpotType,
  type TripDto,
} from '@womo/shared';
import { AmenityPicker } from './AmenityPicker';
import { LocationField } from './LocationField';
import { StarRating } from './StarRating';
import { todayIso } from '../lib/format';

interface Props {
  initial?: SpotDto;
  trips: TripDto[];
  defaultTripId?: string;
  submitLabel: string;
  saving: boolean;
  error?: unknown;
  onSubmit: (input: SpotInput) => void;
  onCancel?: () => void;
}

interface FormState {
  name: string;
  type: SpotType;
  lat: number | null;
  lon: number | null;
  address: string | null;
  country: string | null;
  tripId: string;
  visitedAt: string;
  nights: string;
  rating: number | null;
  pricePerNight: string;
  notes: string;
  isPrivateNote: boolean;
  amenities: Amenity[];
}

export function SpotForm({
  initial,
  trips,
  defaultTripId,
  submitLabel,
  saving,
  error,
  onSubmit,
  onCancel,
}: Props) {
  const [form, setForm] = useState<FormState>(() => ({
    name: initial?.name ?? '',
    type: initial?.type ?? 'stellplatz',
    lat: initial?.lat ?? null,
    lon: initial?.lon ?? null,
    address: initial?.address ?? null,
    country: initial?.country ?? null,
    tripId: initial?.tripId ?? defaultTripId ?? '',
    visitedAt: initial?.visitedAt ?? todayIso(),
    nights: initial?.nights != null ? String(initial.nights) : '1',
    rating: initial?.rating ?? null,
    pricePerNight: initial?.pricePerNight != null ? String(initial.pricePerNight) : '',
    notes: initial?.notes ?? '',
    isPrivateNote: initial?.isPrivateNote ?? false,
    amenities: initial?.amenities ?? [],
  }));

  const [issues, setIssues] = useState<Record<string, string>>({});

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setIssues({});

    if (form.lat === null || form.lon === null) {
      setIssues({ position: 'Bitte zuerst eine Position festlegen.' });
      return;
    }

    const candidate = {
      tripId: form.tripId || null,
      name: form.name,
      lat: form.lat,
      lon: form.lon,
      address: form.address,
      country: form.country,
      type: form.type,
      visitedAt: form.visitedAt || null,
      nights: form.nights === '' ? null : Number(form.nights),
      rating: form.rating,
      pricePerNight: form.pricePerNight === '' ? null : Number(form.pricePerNight),
      currency: 'EUR',
      notes: form.notes || null,
      isPrivateNote: form.isPrivateNote,
      source: initial?.source ?? 'manual',
      amenities: form.amenities,
    };

    // Dasselbe Schema, das auch der Server anwendet – Abweichungen zwischen
    // Formular- und API-Validierung können so gar nicht erst entstehen.
    const parsed = spotInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setIssues(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join('.') || 'form', issue.message]),
        ),
      );
      return;
    }

    onSubmit(parsed.data);
  };

  return (
    <form onSubmit={handleSubmit} className="stack" noValidate>
      {error != null && (
        <div className="alert alert--error" role="alert">
          {error instanceof Error ? error.message : 'Speichern fehlgeschlagen'}
        </div>
      )}

      <div className="field">
        <label htmlFor="spot-name">Name</label>
        <input
          id="spot-name"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder="z. B. Hafenstellplatz Greetsiel"
          required
        />
        {issues.name && <div className="field__error">{issues.name}</div>}
      </div>

      <div className="field">
        <label htmlFor="spot-type">Art</label>
        <select
          id="spot-type"
          value={form.type}
          onChange={(e) => update('type', e.target.value as SpotType)}
        >
          {SPOT_TYPES.map((type) => (
            <option key={type} value={type}>
              {SPOT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="field">
        <label>Position</label>
        <LocationField
          lat={form.lat}
          lon={form.lon}
          address={form.address}
          onChange={(value) =>
            setForm((prev) => ({
              ...prev,
              lat: value.lat,
              lon: value.lon,
              address: value.address !== undefined ? value.address : prev.address,
              country: value.country !== undefined ? value.country : prev.country,
            }))
          }
        />
        {issues.position && <div className="field__error">{issues.position}</div>}
      </fieldset>

      <div className="grid grid--2">
        <div className="field">
          <label htmlFor="spot-date">Übernachtet am</label>
          <input
            id="spot-date"
            type="date"
            value={form.visitedAt}
            onChange={(e) => update('visitedAt', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="spot-nights">Nächte</label>
          <input
            id="spot-nights"
            type="number"
            inputMode="numeric"
            min={0}
            max={365}
            value={form.nights}
            onChange={(e) => update('nights', e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid--2">
        <div className="field">
          <label id="rating-label">Bewertung</label>
          <StarRating value={form.rating} onChange={(value) => update('rating', value)} />
        </div>
        <div className="field">
          <label htmlFor="spot-price">Preis pro Nacht (€)</label>
          <input
            id="spot-price"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.5"
            value={form.pricePerNight}
            onChange={(e) => update('pricePerNight', e.target.value)}
            placeholder="leer = unbekannt"
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="spot-trip">Zur Reise</label>
        <select
          id="spot-trip"
          value={form.tripId}
          onChange={(e) => update('tripId', e.target.value)}
        >
          <option value="">Keiner Reise zuordnen</option>
          {trips.map((trip) => (
            <option key={trip.id} value={trip.id}>
              {trip.title}
            </option>
          ))}
        </select>
        <div className="field__hint">
          Ohne Reise landet der Stellplatz trotzdem in Karte und Liste.
        </div>
      </div>

      <fieldset className="field">
        <label>Ausstattung</label>
        <AmenityPicker
          selected={form.amenities}
          onChange={(amenities) => update('amenities', amenities)}
        />
      </fieldset>

      <div className="field">
        <label htmlFor="spot-notes">Notizen</label>
        <textarea
          id="spot-notes"
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          placeholder="Wie war es? Woran solltest du beim nächsten Mal denken?"
        />
        <label className="row small" style={{ fontWeight: 400, marginTop: '0.5rem' }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={form.isPrivateNote}
            onChange={(e) => update('isPrivateNote', e.target.checked)}
          />
          Notiz privat halten (nicht in geteilten Reisen und Links sichtbar)
        </label>
      </div>

      <div className="row">
        <button type="submit" className="btn" disabled={saving}>
          {saving ? 'Wird gespeichert …' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Abbrechen
          </button>
        )}
      </div>
    </form>
  );
}
