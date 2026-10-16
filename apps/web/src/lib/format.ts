const dateFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const moneyFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '–';

  // Ein reines Datum (2026-10-16) bekommt die Mittagszeit, sonst rutscht es je
  // nach Zeitzone auf den Vortag. Ein vollstaendiger Zeitstempel traegt seine
  // Zone schon mit und wird direkt gelesen -- frueher wurde auch daran
  // "T12:00:00" angehaengt, was eine ungueltige Zeit ergab.
  const datum = iso.includes('T') ? new Date(iso) : new Date(`${iso}T12:00:00`);

  // Ohne diese Pruefung wirft Intl bei ungueltiger Eingabe, und weil
  // Formatierung ueberall mitten im Aufbau passiert, nimmt das die ganze
  // Seite mit statt nur ein Datumsfeld.
  if (Number.isNaN(datum.getTime())) return '–';
  return dateFormat.format(datum);
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

/** Fahrzeit als „4 h 20 min“ – Sekunden interessieren beim Planen nicht. */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds / 60);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

export function formatKm(meters: number): string {
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString('de-DE')} km`;
}

export function formatLiters(liters: number): string {
  return `${liters.toLocaleString('de-DE', { maximumFractionDigits: 1 })} l`;
}

export function formatCoords(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}
