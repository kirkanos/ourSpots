import { useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import {
  EXPENSE_CATEGORIES,
  diaryEntryInputSchema,
  expenseInputSchema,
  fuelLogInputSchema,
  type DiaryEntryDto,
  type ExpenseCategory,
  type ExpenseDto,
  type FuelLogDto,
} from '@womo/shared';
import {
  useDeleteDiary,
  useDeleteExpense,
  useDeleteFuel,
  useDiary,
  useExpenses,
  useFuelLogs,
  useSaveDiary,
  useSaveExpense,
  useSaveFuel,
} from '../../api/hooks';
import { ErrorState, Loading } from '../States';
import { IconPlus, IconTrash } from '../Icons';
import { formatDate, formatLiters, formatMoney, todayIso } from '../../lib/format';

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  sprit: 'Sprit',
  stellplatz: 'Stellplatz',
  maut: 'Maut und Fähren',
  essen: 'Essen und Einkauf',
  freizeit: 'Freizeit',
  sonstiges: 'Sonstiges',
};

export function TripJournal({ tripId, canEdit }: { tripId: string; canEdit: boolean }) {
  return (
    <div className="stack">
      <DiarySection tripId={tripId} canEdit={canEdit} />
      <FuelSection tripId={tripId} canEdit={canEdit} />
      <ExpenseSection tripId={tripId} canEdit={canEdit} />
    </div>
  );
}

// --- Tagebuch ---------------------------------------------------------------

function DiarySection({ tripId, canEdit }: { tripId: string; canEdit: boolean }) {
  const entries = useDiary(tripId);
  const save = useSaveDiary(tripId);
  const remove = useDeleteDiary(tripId);
  const [editing, setEditing] = useState<DiaryEntryDto | 'new' | null>(null);

  return (
    <div className="card stack">
      <div className="row row--between">
        <h2>Reisetagebuch</h2>
        {canEdit && (
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing('new')}>
            <IconPlus />
            Eintrag
          </button>
        )}
      </div>

      {entries.isPending && <Loading />}
      {entries.data?.length === 0 && !editing && (
        <p className="muted">Noch kein Eintrag. Hier passt hin, was vom Tag bleiben soll.</p>
      )}

      {editing && (
        <DiaryForm
          initial={editing === 'new' ? undefined : editing}
          saving={save.isPending}
          error={save.error}
          onCancel={() => setEditing(null)}
          onSubmit={(id, input) => save.mutate({ id, input }, { onSuccess: () => setEditing(null) })}
        />
      )}

      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {entries.data?.map((entry) => (
          <li key={entry.id} className="entry">
            <div className="row row--between">
              <div>
                <strong>{entry.title ?? formatDate(entry.date)}</strong>
                <div className="small muted">
                  {formatDate(entry.date)}
                  {entry.odometerKm != null && ` · ${entry.odometerKm.toLocaleString('de-DE')} km`}
                  {entry.weather && ` · ${entry.weather}`}
                </div>
              </div>
              {canEdit && (
                <div className="row">
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(entry)}>
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger btn--small"
                    aria-label="Eintrag löschen"
                    onClick={() => remove.mutate(entry.id)}
                  >
                    <IconTrash />
                  </button>
                </div>
              )}
            </div>
            {entry.text && <p style={{ whiteSpace: 'pre-wrap', margin: '0.5rem 0 0' }}>{entry.text}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DiaryForm({
  initial,
  saving,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: DiaryEntryDto;
  saving: boolean;
  error: unknown;
  onSubmit: (id: string, input: ReturnType<typeof diaryEntryInputSchema.parse>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    date: initial?.date ?? todayIso(),
    title: initial?.title ?? '',
    text: initial?.text ?? '',
    odometerKm: initial?.odometerKm != null ? String(initial.odometerKm) : '',
    weather: initial?.weather ?? '',
  });
  const [issue, setIssue] = useState<string | null>(null);

  const submit = () => {
    const parsed = diaryEntryInputSchema.safeParse({
      date: form.date,
      title: form.title || null,
      text: form.text || null,
      odometerKm: form.odometerKm === '' ? null : Number(form.odometerKm),
      weather: form.weather || null,
    });
    if (!parsed.success) {
      setIssue(parsed.error.issues[0]?.message ?? 'Bitte Eingaben prüfen');
      return;
    }
    onSubmit(initial?.id ?? uuidv7(), parsed.data);
  };

  return (
    <div className="card stack" style={{ background: 'var(--surface-alt)' }}>
      <div className="grid grid--2">
        <div className="field">
          <label htmlFor="diary-date">Datum</label>
          <input
            id="diary-date"
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="diary-odo">Kilometerstand</label>
          <input
            id="diary-odo"
            type="number"
            inputMode="numeric"
            value={form.odometerKm}
            onChange={(e) => setForm({ ...form, odometerKm: e.target.value })}
            placeholder="optional"
          />
        </div>
      </div>
      <div className="grid grid--2">
        <div className="field">
          <label htmlFor="diary-title">Überschrift</label>
          <input
            id="diary-title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="diary-weather">Wetter</label>
          <input
            id="diary-weather"
            value={form.weather}
            onChange={(e) => setForm({ ...form, weather: e.target.value })}
            placeholder="z. B. sonnig, 18 °C"
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="diary-text">Text</label>
        <textarea
          id="diary-text"
          value={form.text}
          onChange={(e) => setForm({ ...form, text: e.target.value })}
        />
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

// --- Tanken -----------------------------------------------------------------

function FuelSection({ tripId, canEdit }: { tripId: string; canEdit: boolean }) {
  const logs = useFuelLogs(tripId);
  const save = useSaveFuel(tripId);
  const remove = useDeleteFuel(tripId);
  const [open, setOpen] = useState(false);

  return (
    <div className="card stack">
      <div className="row row--between">
        <h2>Tankungen</h2>
        {canEdit && (
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpen((v) => !v)}>
            <IconPlus />
            Tankung
          </button>
        )}
      </div>

      {open && (
        <FuelForm
          saving={save.isPending}
          error={save.error}
          onCancel={() => setOpen(false)}
          onSubmit={(id, input) => save.mutate({ id, input }, { onSuccess: () => setOpen(false) })}
        />
      )}

      {logs.isPending && <Loading />}
      {logs.data?.length === 0 && !open && (
        <p className="muted">
          Noch nichts eingetragen. Aus aufeinanderfolgenden Volltankungen ergibt sich der
          Durchschnittsverbrauch.
        </p>
      )}

      {(logs.data?.length ?? 0) > 0 && (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Menge</th>
                <th>Preis/l</th>
                <th>Summe</th>
                <th>km-Stand</th>
                <th>voll</th>
                {canEdit && <th aria-label="Aktionen" />}
              </tr>
            </thead>
            <tbody>
              {logs.data?.map((log: FuelLogDto) => (
                <tr key={log.id}>
                  <td>{formatDate(log.date)}</td>
                  <td>{formatLiters(log.liters)}</td>
                  <td>{log.pricePerL != null ? `${log.pricePerL.toFixed(3)} €` : '–'}</td>
                  <td>{formatMoney(log.totalCost)}</td>
                  <td>{log.odometerKm?.toLocaleString('de-DE') ?? '–'}</td>
                  <td>{log.isFull ? 'ja' : 'nein'}</td>
                  {canEdit && (
                    <td>
                      <button
                        type="button"
                        className="btn btn--danger btn--small"
                        aria-label="Tankung löschen"
                        onClick={() => remove.mutate(log.id)}
                      >
                        <IconTrash />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FuelForm({
  saving,
  error,
  onSubmit,
  onCancel,
}: {
  saving: boolean;
  error: unknown;
  onSubmit: (id: string, input: ReturnType<typeof fuelLogInputSchema.parse>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    date: todayIso(),
    liters: '',
    pricePerL: '',
    totalCost: '',
    odometerKm: '',
    isFull: true,
  });
  const [issue, setIssue] = useState<string | null>(null);

  const submit = () => {
    const parsed = fuelLogInputSchema.safeParse({
      date: form.date,
      liters: Number(form.liters),
      pricePerL: form.pricePerL === '' ? null : Number(form.pricePerL),
      totalCost: form.totalCost === '' ? null : Number(form.totalCost),
      odometerKm: form.odometerKm === '' ? null : Number(form.odometerKm),
      isFull: form.isFull,
    });
    if (!parsed.success) {
      setIssue(parsed.error.issues[0]?.message ?? 'Bitte Eingaben prüfen');
      return;
    }
    onSubmit(uuidv7(), parsed.data);
  };

  return (
    <div className="card stack" style={{ background: 'var(--surface-alt)' }}>
      <div className="grid grid--2">
        <div className="field">
          <label htmlFor="fuel-date">Datum</label>
          <input id="fuel-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="fuel-liters">Liter</label>
          <input
            id="fuel-liters"
            type="number"
            inputMode="decimal"
            step="0.01"
            value={form.liters}
            onChange={(e) => setForm({ ...form, liters: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="fuel-price">Preis je Liter</label>
          <input
            id="fuel-price"
            type="number"
            inputMode="decimal"
            step="0.001"
            value={form.pricePerL}
            onChange={(e) => setForm({ ...form, pricePerL: e.target.value })}
          />
          <div className="field__hint">Eines von beiden genügt – das andere wird ausgerechnet.</div>
        </div>
        <div className="field">
          <label htmlFor="fuel-total">Gesamtpreis</label>
          <input
            id="fuel-total"
            type="number"
            inputMode="decimal"
            step="0.01"
            value={form.totalCost}
            onChange={(e) => setForm({ ...form, totalCost: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="fuel-odo">Kilometerstand</label>
          <input
            id="fuel-odo"
            type="number"
            inputMode="numeric"
            value={form.odometerKm}
            onChange={(e) => setForm({ ...form, odometerKm: e.target.value })}
          />
          <div className="field__hint">Ohne ihn lässt sich kein Verbrauch berechnen.</div>
        </div>
        <div className="field">
          <label className="row small" style={{ fontWeight: 400, marginTop: '1.8rem' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={form.isFull}
              onChange={(e) => setForm({ ...form, isFull: e.target.checked })}
            />
            Vollgetankt
          </label>
        </div>
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

// --- Ausgaben ---------------------------------------------------------------

function ExpenseSection({ tripId, canEdit }: { tripId: string; canEdit: boolean }) {
  const expenses = useExpenses(tripId);
  const save = useSaveExpense(tripId);
  const remove = useDeleteExpense(tripId);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    date: todayIso(),
    category: 'stellplatz' as ExpenseCategory,
    amount: '',
    note: '',
  });
  const [issue, setIssue] = useState<string | null>(null);

  const submit = () => {
    const parsed = expenseInputSchema.safeParse({
      date: form.date,
      category: form.category,
      amount: Number(form.amount),
      currency: 'EUR',
      note: form.note || null,
    });
    if (!parsed.success) {
      setIssue(parsed.error.issues[0]?.message ?? 'Bitte Eingaben prüfen');
      return;
    }
    save.mutate(
      { id: uuidv7(), input: parsed.data },
      {
        onSuccess: () => {
          setOpen(false);
          setForm({ ...form, amount: '', note: '' });
        },
      },
    );
  };

  return (
    <div className="card stack">
      <div className="row row--between">
        <h2>Ausgaben</h2>
        {canEdit && (
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpen((v) => !v)}>
            <IconPlus />
            Ausgabe
          </button>
        )}
      </div>

      {open && (
        <div className="card stack" style={{ background: 'var(--surface-alt)' }}>
          <div className="grid grid--2">
            <div className="field">
              <label htmlFor="exp-date">Datum</label>
              <input id="exp-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="exp-category">Kategorie</label>
              <select
                id="exp-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
              >
                {EXPENSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="exp-amount">Betrag (€)</label>
              <input
                id="exp-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="exp-note">Notiz</label>
              <input id="exp-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
          </div>
          {issue && <div className="field__error">{issue}</div>}
          {save.error && <ErrorState error={save.error} />}
          <div className="row">
            <button type="button" className="btn" onClick={submit} disabled={save.isPending}>
              Speichern
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {expenses.isPending && <Loading />}
      {expenses.data?.length === 0 && !open && (
        <p className="muted">Noch keine Ausgaben erfasst. Sprit wird separat unter Tankungen geführt.</p>
      )}

      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {expenses.data?.map((expense: ExpenseDto) => (
          <li key={expense.id} className="row row--between">
            <span>
              <span className="badge">{CATEGORY_LABELS[expense.category]}</span>{' '}
              {expense.note || formatDate(expense.date)}
            </span>
            <span className="row">
              <strong>{formatMoney(expense.amount, expense.currency)}</strong>
              {canEdit && (
                <button
                  type="button"
                  className="btn btn--danger btn--small"
                  aria-label="Ausgabe löschen"
                  onClick={() => remove.mutate(expense.id)}
                >
                  <IconTrash />
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
