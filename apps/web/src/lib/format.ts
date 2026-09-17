const dateFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const moneyFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '–';
  return dateFormat.format(new Date(`${iso}T12:00:00`));
}

export function formatDateRange(from: string | null, to: string | null): string {
  if (!from && !to) return 'Ohne Zeitraum';
  if (from && to) return `${formatDate(from)} – ${formatDate(to)}`;
  return from ? `ab ${formatDate(from)}` : `bis ${formatDate(to)}`;
}

export function formatMoney(value: number | null | undefined, currency = 'EUR'): string {
  if (value == null) return '–';
  return currency === 'EUR'
    ? moneyFormat.format(value)
    : new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(value);
}

export function formatDistance(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/** Heutiges Datum als JJJJ-MM-TT in lokaler Zeit, nicht in UTC. */
export function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function formatCoords(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}
