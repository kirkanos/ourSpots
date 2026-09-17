/**
 * Reisetage sind reine Kalenderdaten. Sie werden als UTC-Mitternacht
 * gespeichert und wieder als JJJJ-MM-TT ausgeliefert, damit ein Datum nicht
 * durch die Zeitzone des Servers oder des Handys um einen Tag springt.
 */

export function toDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

export function fromDateOnly(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

export function decimalToNumber(value: { toNumber(): number } | null | undefined): number | null {
  return value == null ? null : value.toNumber();
}
