import type { ExpenseCategory } from '@ourspots/shared';
import { useTripStats } from '../../api/hooks';
import { ErrorState, Loading } from '../States';
import { formatLiters, formatMoney } from '../../lib/format';

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  sprit: 'Sprit',
  stellplatz: 'Stellplatz',
  maut: 'Maut und Fähren',
  essen: 'Essen und Einkauf',
  freizeit: 'Freizeit',
  sonstiges: 'Sonstiges',
};

export function TripStats({ tripId }: { tripId: string }) {
  const stats = useTripStats(tripId);

  if (stats.isPending) return <Loading />;
  if (stats.error) return <ErrorState error={stats.error} />;
  if (!stats.data) return null;

  const s = stats.data;
  const maxAmount = Math.max(s.fuelCost, ...s.expensesByCategory.map((e) => e.amount), 1);

  return (
    <div className="card stack">
      <h2>Auswertung</h2>

      <div className="stat-grid">
        <Stat label="Gesamtkosten" value={formatMoney(s.totalCost)} />
        <Stat label="Strecke" value={s.distanceKm ? `${s.distanceKm.toLocaleString('de-DE')} km` : '–'} />
        <Stat
          label="Verbrauch"
          value={s.consumptionL100km ? `${s.consumptionL100km.toLocaleString('de-DE')} l/100 km` : '–'}
          hint={s.consumptionL100km ? undefined : 'Braucht zwei Volltankungen mit Kilometerstand'}
        />
        <Stat label="Pro Tag" value={s.costPerDay ? formatMoney(s.costPerDay) : '–'} />
        <Stat label="Pro Kilometer" value={s.costPerKm ? formatMoney(s.costPerKm) : '–'} />
        <Stat label="Übernachtungen" value={String(s.nights)} />
        <Stat
          label="Ø Bewertung"
          value={s.averageRating ? `${s.averageRating.toLocaleString('de-DE')} von 5` : '–'}
        />
        <Stat
          label="Ø Stellplatzpreis"
          value={s.averagePricePerNight != null ? formatMoney(s.averagePricePerNight) : '–'}
        />
      </div>

      {(s.fuelCost > 0 || s.expensesByCategory.length > 0) && (
        <div className="stack">
          <h3>Wohin das Geld ging</h3>
          <ul className="bars">
            {s.fuelCost > 0 && (
              <Bar
                label={`Sprit (${formatLiters(s.fuelLiters)})`}
                amount={s.fuelCost}
                max={maxAmount}
              />
            )}
            {s.expensesByCategory.map((entry) => (
              <Bar
                key={entry.category}
                label={CATEGORY_LABELS[entry.category]}
                amount={entry.amount}
                max={maxAmount}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      {hint && <div className="field__hint">{hint}</div>}
    </div>
  );
}

function Bar({ label, amount, max }: { label: string; amount: number; max: number }) {
  // Prozentwert nur zur Darstellung; die Zahl daneben bleibt die Wahrheit.
  const percent = Math.max(2, Math.round((amount / max) * 100));
  return (
    <li className="bar">
      <div className="row row--between small">
        <span>{label}</span>
        <strong>{formatMoney(amount)}</strong>
      </div>
      <div className="bar__track">
        <div className="bar__fill" style={{ width: `${percent}%` }} />
      </div>
    </li>
  );
}
