import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v7 as uuidv7 } from 'uuid';
import { spotInputSchema, type SpotType, SPOT_TYPES, SPOT_TYPE_LABELS } from '@ourspots/shared';
import { api } from '../api/client';
import { reverseGeocode, useSaveSpot, useTrips } from '../api/hooks';
import { StarRating } from '../components/StarRating';
import { IconCamera, IconCrosshair } from '../components/Icons';
import { formatCoords, todayIso } from '../lib/format';

type GpsState =
  | { status: 'locating' }
  | { status: 'ready'; lat: number; lon: number; accuracy: number }
  | { status: 'error'; message: string };

/**
 * Schnellerfassung für unterwegs: Standort holen, Namen eintippen, Foto
 * anhängen, fertig. Alles Weitere lässt sich später in Ruhe am Eintrag
 * ergänzen.
 */
export function CapturePage() {
  const navigate = useNavigate();
  const trips = useTrips();
  const save = useSaveSpot();
  const fileInput = useRef<HTMLInputElement>(null);

  const [gps, setGps] = useState<GpsState>({ status: 'locating' });
  const [address, setAddress] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<SpotType>('stellplatz');
  const [rating, setRating] = useState<number | null>(null);
  const [nights, setNights] = useState('1');
  const [tripId, setTripId] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadNote, setUploadNote] = useState<string | null>(null);

  const locate = () => {
    setGps({ status: 'locating' });
    if (!('geolocation' in navigator)) {
      setGps({ status: 'error', message: 'Dieses Gerät liefert keine Standortdaten.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setGps({ status: 'ready', lat: latitude, lon: longitude, accuracy });
        // Die Adresse ist nur eine Bequemlichkeit; ohne Netz geht es auch ohne.
        void reverseGeocode(latitude, longitude)
          .then((place) => {
            if (!place) return;
            setAddress(place.displayName);
            setCountry(place.country);
            setName((current) => current || shortPlaceName(place.displayName));
          })
          .catch(() => undefined);
      },
      (err) => {
        setGps({
          status: 'error',
          message:
            err.code === err.PERMISSION_DENIED
              ? 'Der Zugriff auf den Standort wurde abgelehnt. Erlaube ihn in den Browser-Einstellungen.'
              : 'Der Standort konnte nicht ermittelt werden.',
        });
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
    );
  };

  useEffect(locate, []);

  // Der Reisevorschlag ist die gerade laufende Reise – meistens die richtige.
  useEffect(() => {
    if (tripId) return;
    const active = trips.data?.find((trip) => trip.status === 'active');
    if (active) setTripId(active.id);
  }, [trips.data, tripId]);

  const submit = async () => {
    if (gps.status !== 'ready') return;

    const parsed = spotInputSchema.safeParse({
      tripId: tripId || null,
      name: name.trim() || `Stellplatz vom ${todayIso()}`,
      lat: gps.lat,
      lon: gps.lon,
      address,
      country,
      type,
      visitedAt: todayIso(),
      nights: nights === '' ? null : Number(nights),
      rating,
      pricePerNight: null,
      currency: 'EUR',
      notes: null,
      isPrivateNote: false,
      source: 'gps',
      amenities: [],
    });
    if (!parsed.success) return;

    const spotId = uuidv7();
    const saved = await save.mutateAsync({ id: spotId, input: parsed.data });

    for (const [index, file] of files.entries()) {
      setUploadNote(`Foto ${index + 1} von ${files.length} wird hochgeladen …`);
      const form = new FormData();
      form.append('file', file);
      await api(`/spots/${saved.id}/photos`, { method: 'POST', body: form }).catch(() => undefined);
    }

    navigate(`/stellplaetze/${saved.id}`, { replace: true });
  };

  return (
    <div className="page stack">
      <h1>Hier bin ich</h1>

      <div className="card stack">
        {gps.status === 'locating' && (
          <div className="row">
            <div className="spinner" />
            <span className="muted">Standort wird ermittelt …</span>
          </div>
        )}

        {gps.status === 'error' && (
          <>
            <div className="alert alert--error">{gps.message}</div>
            <button type="button" className="btn btn--ghost" onClick={locate}>
              <IconCrosshair />
              Nochmal versuchen
            </button>
          </>
        )}

        {gps.status === 'ready' && (
          <>
            <div className="row row--between">
              <div>
                <strong>{formatCoords(gps.lat, gps.lon)}</strong>
                <div className="small muted">Genauigkeit ca. {Math.round(gps.accuracy)} m</div>
              </div>
              <button type="button" className="btn btn--ghost btn--small" onClick={locate}>
                <IconCrosshair />
                Neu messen
              </button>
            </div>
            {address && <div className="small muted">{address}</div>}
          </>
        )}
      </div>

      <div className="field">
        <label htmlFor="capture-name">Name</label>
        <input
          id="capture-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Wird sonst aus dem Datum gebildet"
        />
      </div>

      <div className="grid grid--2">
        <div className="field">
          <label htmlFor="capture-type">Art</label>
          <select id="capture-type" value={type} onChange={(e) => setType(e.target.value as SpotType)}>
            {SPOT_TYPES.map((value) => (
              <option key={value} value={value}>
                {SPOT_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="capture-nights">Nächte</label>
          <input
            id="capture-nights"
            type="number"
            inputMode="numeric"
            min={0}
            value={nights}
            onChange={(e) => setNights(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label>Bewertung</label>
        <StarRating value={rating} onChange={setRating} />
      </div>

      <div className="field">
        <label htmlFor="capture-trip">Zur Reise</label>
        <select id="capture-trip" value={tripId} onChange={(e) => setTripId(e.target.value)}>
          <option value="">Keiner Reise zuordnen</option>
          {trips.data?.map((trip) => (
            <option key={trip.id} value={trip.id}>
              {trip.title}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        <button type="button" className="btn btn--ghost btn--block" onClick={() => fileInput.current?.click()}>
          <IconCamera />
          {files.length === 0
            ? 'Fotos aufnehmen'
            : `${files.length} ${files.length === 1 ? 'Foto' : 'Fotos'} ausgewählt`}
        </button>
      </div>

      {save.error && (
        <div className="alert alert--error">
          {save.error instanceof Error ? save.error.message : 'Speichern fehlgeschlagen'}
        </div>
      )}
      {uploadNote && <p className="muted small">{uploadNote}</p>}

      <button
        type="button"
        className="btn btn--block"
        onClick={() => void submit()}
        disabled={gps.status !== 'ready' || save.isPending}
      >
        {save.isPending ? 'Wird gespeichert …' : 'Stellplatz speichern'}
      </button>
    </div>
  );
}

/** Aus „Greetsiel, Krummhörn, Landkreis Aurich, …“ wird „Greetsiel“. */
function shortPlaceName(displayName: string): string {
  return displayName.split(',')[0]?.trim() ?? '';
}
