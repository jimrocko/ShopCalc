import type { PriceRecord, Store } from './types';

export const DAY_MS = 24 * 60 * 60 * 1000;

export function isStale(recordedAt: number, staleAfterDays: number, now = Date.now()): boolean {
  return now - recordedAt > staleAfterDays * DAY_MS;
}

export function ageInDays(recordedAt: number, now = Date.now()): number {
  return Math.max(0, Math.floor((now - recordedAt) / DAY_MS));
}

const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function formatDate(ts: number): string {
  return dateFmt.format(new Date(ts));
}

export function formatAge(recordedAt: number, now = Date.now()): string {
  const days = ageInDays(recordedAt, now);
  if (days === 0) return 'heute';
  if (days === 1) return 'gestern';
  if (days < 30) return `vor ${days} Tagen`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? 'vor 1 Monat' : `vor ${months} Monaten`;
  const years = Math.floor(days / 365);
  return years <= 1 ? 'vor über 1 Jahr' : `vor ${years} Jahren`;
}

/** Neuester Preis je Markt (storeId null = „ohne Markt“). */
export function latestPerStore(records: PriceRecord[]): PriceRecord[] {
  const map = new Map<string, PriceRecord>();
  for (const r of records) {
    const key = r.storeId ?? '';
    const prev = map.get(key);
    if (!prev || r.recordedAt > prev.recordedAt) map.set(key, r);
  }
  return [...map.values()];
}

/** Neuester Preis insgesamt, bevorzugt im angegebenen Markt. */
export function bestKnownPrice(records: PriceRecord[], storeId: string | null): PriceRecord | null {
  const latest = latestPerStore(records);
  if (storeId) {
    const inStore = latest.find((r) => r.storeId === storeId);
    if (inStore) return inStore;
  }
  return latest.sort((a, b) => b.recordedAt - a.recordedAt)[0] ?? null;
}

export interface ComparisonRow {
  storeId: string | null;
  storeName: string;
  priceCents: number;
  recordedAt: number;
  stale: boolean;
}

/**
 * Informationsvergleich: neuester gespeicherter Preis je Markt.
 * Bewusst nach Marktname sortiert (nicht nach Preis), um keine Empfehlung auszusprechen.
 * Da sich der Vergleich auf genau ein Produkt (gleicher Barcode bzw. gleiche Packungsgröße) bezieht,
 * werden nur vergleichbare Preise gegenübergestellt.
 */
export function buildComparison(
  records: PriceRecord[],
  stores: Store[],
  staleAfterDays: number,
  now = Date.now(),
): ComparisonRow[] {
  const names = new Map(stores.map((s) => [s.id, s.name]));
  return latestPerStore(records)
    .map((r) => ({
      storeId: r.storeId,
      storeName: r.storeId ? names.get(r.storeId) ?? 'Unbekannter Markt' : 'Ohne Markt',
      priceCents: r.priceCents,
      recordedAt: r.recordedAt,
      stale: isStale(r.recordedAt, staleAfterDays, now),
    }))
    .sort((a, b) => a.storeName.localeCompare(b.storeName, 'de'));
}
