import { useRef, useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { vehicleInputSchema, type VehicleDto, type VehicleInput } from '@ourspots/shared';
import {
  useDeleteVehicle,
  useImportSpots,
  useSaveVehicle,
  useTrips,
  useVehicles,
} from '../api/hooks';
import { ErrorState, Loading } from '../components/States';
import { IconPlus, IconTrash } from '../components/Icons';
import { OfflineSettings } from '../components/OfflineSettings';

export function SettingsPage() {
  return (
    <div className="page stack">
      <h1>Einstellungen</h1>
      <VehicleSection />
      <ImportSection />
      <OfflineSettings />
    </div>
  );
}

// --- Fahrzeuge --------------------------------------------------------------

function VehicleSection() {
  const vehicles = useVehicles();
  const save = useSaveVehicle();
  const remove = useDeleteVehicle();
  const [editing, setEditing] = useState<VehicleDto | 'new' | null>(null);

  return (
    <div className="card stack">
      <div className="row row--between">
        <h2>Fahrzeuge</h2>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing('new')}>
          <IconPlus />
          Fahrzeug
        </button>
      </div>
      <p className="muted small">
        Höhe, Breite, Länge und Gewicht fließen in die Routenberechnung ein. Ohne sie wird gerechnet
        wie für einen Pkw – also womöglich unter einer zu niedrigen Brücke hindurch.
      </p>

      {vehicles.isPending && <Loading />}
      {vehicles.data?.length === 0 && !editing && (
        <p className="muted">Noch kein Fahrzeug hinterlegt.</p>
      )}

      {editing && (
        <VehicleForm
          initial={editing === 'new' ? undefined : editing}
          saving={save.isPending}
          error={save.error}
          onCancel={() => setEditing(null)}
          onSubmit={(id, input) => save.mutate({ id, input }, { onSuccess: () => setEditing(null) })}
        />
      )}

      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {vehicles.data?.map((vehicle) => (
          <li key={vehicle.id} className="row row--between">
            <span>
              <strong>{vehicle.name}</strong>
              <div className="small muted">{describe(vehicle)}</div>
            </span>
            <span className="row">
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(vehicle)}>
                Bearbeiten
              </button>
              <button
                type="button"
                className="btn btn--danger btn--small"
                aria-label="Fahrzeug löschen"
                onClick={() => {
                  if (window.confirm(`„${vehicle.name}“ löschen?`)) remove.mutate(vehicle.id);
                }}
              >
                <IconTrash />
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function describe(vehicle: VehicleDto): string {
  const parts: string[] = [];
  if (vehicle.lengthM) parts.push(`${vehicle.lengthM} m lang`);
  if (vehicle.heightM) parts.push(`${vehicle.heightM} m hoch`);
  if (vehicle.widthM) parts.push(`${vehicle.widthM} m breit`);
  if (vehicle.weightT) parts.push(`${vehicle.weightT} t`);
  if (vehicle.consumptionL100km) parts.push(`${vehicle.consumptionL100km} l/100 km`);
  return parts.length ? parts.join(' · ') : 'Keine Maße hinterlegt';
}

function VehicleForm({
  initial,
  saving,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: VehicleDto;
  saving: boolean;
  error: unknown;
  onSubmit: (id: string, input: VehicleInput) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    heightM: initial?.heightM != null ? String(initial.heightM) : '',
    widthM: initial?.widthM != null ? String(initial.widthM) : '',
    lengthM: initial?.lengthM != null ? String(initial.lengthM) : '',
    weightT: initial?.weightT != null ? String(initial.weightT) : '',
    consumptionL100km: initial?.consumptionL100km != null ? String(initial.consumptionL100km) : '',
  });
  const [issue, setIssue] = useState<string | null>(null);

  const number = (value: string) => (value === '' ? null : Number(value.replace(',', '.')));

  const submit = () => {
    const parsed = vehicleInputSchema.safeParse({
      name: form.name,
      heightM: number(form.heightM),
      widthM: number(form.widthM),
      lengthM: number(form.lengthM),
      weightT: number(form.weightT),
      consumptionL100km: number(form.consumptionL100km),
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setIssue(first ? `${first.path.join('.')}: ${first.message}` : 'Bitte Eingaben prüfen');
      return;
    }
    onSubmit(initial?.id ?? uuidv7(), parsed.data);
  };

  return (
    <div className="card stack" style={{ background: 'var(--surface-alt)' }}>
      <div className="field">
        <label htmlFor="veh-name">Bezeichnung</label>
        <input
          id="veh-name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="z. B. Kastenwagen 6,4 m"
        />
      </div>
      <div className="grid grid--2">
        {(
          [
            ['heightM', 'Höhe (m)', '2.85'],
            ['widthM', 'Breite (m)', '2.05'],
            ['lengthM', 'Länge (m)', '6.40'],
            ['weightT', 'Zulässiges Gesamtgewicht (t)', '3.5'],
            ['consumptionL100km', 'Verbrauch (l/100 km)', '9.8'],
          ] as const
        ).map(([key, label, placeholder]) => (
          <div className="field" key={key}>
            <label htmlFor={`veh-${key}`}>{label}</label>
            <input
              id={`veh-${key}`}
              type="number"
              inputMode="decimal"
              step="0.01"
              value={form[key]}
              placeholder={placeholder}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </div>
        ))}
      </div>
      {issue && <div className="field__error">{issue}</div>}
      {error != null && <ErrorState error={error} />}
      <div className="row">
        <button type="button" className="btn" onClick={submit} disabled={saving}>
          {saving ? 'Wird gespeichert …' : 'Speichern'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}

// --- Import -----------------------------------------------------------------

function ImportSection() {
  const trips = useTrips();
  const importSpots = useImportSpots();
  const fileInput = useRef<HTMLInputElement>(null);
  const [tripId, setTripId] = useState('');

  return (
    <div className="card stack">
      <h2>Stellplätze importieren</h2>
      <p className="muted small">
        Aus GPX, KML oder CSV. Bei CSV müssen Spalten für Breiten- und Längengrad vorhanden sein
        (<code>lat</code>/<code>lon</code> oder <code>Breitengrad</code>/<code>Längengrad</code>).
        Punkte, an denen schon ein Eintrag liegt, werden übersprungen.
      </p>

      <div className="field">
        <label htmlFor="import-trip">Einer Reise zuordnen</label>
        <select id="import-trip" value={tripId} onChange={(e) => setTripId(e.target.value)}>
          <option value="">Keiner Reise zuordnen</option>
          {trips.data?.map((trip) => (
            <option key={trip.id} value={trip.id}>
              {trip.title}
            </option>
          ))}
        </select>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".gpx,.kml,.csv,application/gpx+xml,text/csv"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importSpots.mutate({ file, tripId: tripId || undefined });
          if (fileInput.current) fileInput.current.value = '';
        }}
      />

      <div>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => fileInput.current?.click()}
          disabled={importSpots.isPending}
        >
          {importSpots.isPending ? 'Wird gelesen …' : 'Datei auswählen'}
        </button>
      </div>

      {importSpots.error && <ErrorState error={importSpots.error} />}

      {importSpots.data && (
        <div className="alert stack">
          <strong>
            {importSpots.data.imported} übernommen, {importSpots.data.skipped} übersprungen.
          </strong>
          {importSpots.data.messages.map((message) => (
            <span className="small" key={message}>
              {message}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
