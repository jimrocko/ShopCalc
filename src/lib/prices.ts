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

/* ---------- Einordnung eines Preises ---------- */

/**
 * Eindeutige Einordnung eines Preises (Vorrang von oben nach unten):
 * - estimated:  vom Nutzer als Schätzung markiert
 * - online:     Onlinepreis (Shop im Internet)
 * - old:        älter als die eingestellte Schwelle
 * - manual:     selbst im Laden erfasst und aktuell
 * - confirmed:  aktueller Filialpreis aus öffentlicher Quelle, belegt durch Preisschild/Kassenbon
 * - unverified: aktueller Filialpreis aus öffentlicher Quelle ohne erkennbaren Beleg
 */
export type PriceKind = 'estimated' | 'online' | 'old' | 'manual' | 'confirmed' | 'unverified';

export interface PriceDescription {
  kind: PriceKind;
  /** Kurzlabel für das Badge */
  label: string;
  tone: 'accent' | 'warn' | 'muted' | 'info';
  /** Quelle in Worten, z. B. "Eigene Eingabe" oder "Open Prices · Preisschild" */
  sourceLabel: string;
  channelLabel: 'Filialpreis' | 'Onlinepreis';
  stale: boolean;
}

const PROOF_LABEL: Record<string, string> = {
  price_tag: 'Preisschild',
  receipt: 'Kassenbon',
  gdpr_request: 'Kaufhistorie',
  shop_import: 'Händlerdaten',
};

export function describePrice(r: PriceRecord, staleAfterDays: number, now = Date.now()): PriceDescription {
  const stale = isStale(r.recordedAt, staleAfterDays, now);
  const sourceLabel =
    r.source === 'manual'
      ? 'Eigene Eingabe'
      : `Open Prices${r.proof && PROOF_LABEL[r.proof] ? ` · ${PROOF_LABEL[r.proof]}` : ''}`;
  const channelLabel = r.channel === 'online' ? 'Onlinepreis' : 'Filialpreis';
  const base = { sourceLabel, channelLabel, stale } as const;
  if (r.estimated) return { ...base, kind: 'estimated', label: 'Geschätzt', tone: 'muted' };
  if (r.channel === 'online') return { ...base, kind: 'online', label: 'Onlinepreis', tone: 'info' };
  if (stale) return { ...base, kind: 'old', label: 'Älterer Preis', tone: 'warn' };
  if (r.source === 'manual') return { ...base, kind: 'manual', label: 'Manuell erfasst', tone: 'accent' };
  if (r.proof && PROOF_LABEL[r.proof]) return { ...base, kind: 'confirmed', label: 'Aktuell bestätigt', tone: 'accent' };
  return { ...base, kind: 'unverified', label: 'Ohne Beleg', tone: 'muted' };
}

/* ---------- Auswahl und Vergleich ---------- */

/** Gruppierungsschlüssel: Quelle + Kanal + Markt bzw. Ort */
export function priceGroupKey(r: PriceRecord): string {
  return `${r.source}|${r.channel}|${r.storeId ?? r.locationLabel ?? ''}`;
}

/** Neuester Preis je Quelle und Markt. */
export function latestPerStore(records: PriceRecord[]): PriceRecord[] {
  const map = new Map<string, PriceRecord>();
  for (const r of records) {
    const key = priceGroupKey(r);
    const prev = map.get(key);
    if (!prev || r.recordedAt > prev.recordedAt) map.set(key, r);
  }
  return [...map.values()];
}

/**
 * Bester bekannter EIGENER Preis zum Vorausfüllen: bevorzugt der aktuelle Markt,
 * Schätzungen nur, wenn nichts anderes vorliegt. Externe Preise werden hier nie
 * automatisch übernommen – sie werden nur in der Produktkarte angezeigt.
 */
export function bestKnownPrice(records: PriceRecord[], storeId: string | null): PriceRecord | null {
  const pick = (list: PriceRecord[]): PriceRecord | null => {
    const ranked = latestPerStore(list).sort((a, b) => b.recordedAt - a.recordedAt);
    return (storeId ? ranked.find((r) => r.storeId === storeId) : undefined) ?? ranked[0] ?? null;
  };
  const own = records.filter((r) => r.source === 'manual');
  // Echte Preise haben immer Vorrang vor Schätzungen – auch wenn die Schätzung neuer ist
  return pick(own.filter((r) => !r.estimated)) ?? pick(own.filter((r) => r.estimated));
}

export interface ComparisonRow {
  key: string;
  record: PriceRecord;
  storeId: string | null;
  storeName: string;
  priceCents: number;
  recordedAt: number;
  stale: boolean;
  description: PriceDescription;
}

export function priceLocationName(r: PriceRecord, stores: Store[]): string {
  if (r.storeId) {
    const name = stores.find((s) => s.id === r.storeId)?.name;
    if (name && r.source === 'manual') return name;
    if (name && r.locationLabel) return r.locationLabel;
    if (name) return name;
  }
  if (r.locationLabel) return r.locationLabel;
  return r.source === 'manual' ? 'Ohne Markt' : 'Unbekannter Ort';
}

/**
 * Informationsvergleich: neuester Preis je Quelle und Markt.
 * Eigene Preise zuerst (alphabetisch nach Markt), danach externe Preise (neueste zuerst).
 * Bewusst NICHT nach Preis sortiert, um keine Empfehlung auszusprechen.
 * Da sich der Vergleich auf genau ein Produkt (gleicher Barcode bzw. gleiche Packungsgröße) bezieht,
 * werden nur vergleichbare Preise gegenübergestellt.
 */
export function buildComparison(
  records: PriceRecord[],
  stores: Store[],
  staleAfterDays: number,
  now = Date.now(),
): ComparisonRow[] {
  return latestPerStore(records)
    .map((r) => {
      const description = describePrice(r, staleAfterDays, now);
      return {
        key: priceGroupKey(r),
        record: r,
        storeId: r.storeId,
        storeName: priceLocationName(r, stores),
        priceCents: r.priceCents,
        recordedAt: r.recordedAt,
        stale: description.stale,
        description,
      };
    })
    .sort((a, b) => {
      const sa = a.record.source === 'manual' ? 0 : 1;
      const sb = b.record.source === 'manual' ? 0 : 1;
      if (sa !== sb) return sa - sb;
      if (sa === 0) return a.storeName.localeCompare(b.storeName, 'de');
      return b.recordedAt - a.recordedAt;
    });
}
