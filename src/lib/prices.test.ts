import { describe, expect, it } from 'vitest';
import { bestKnownPrice, buildComparison, DAY_MS, describePrice, formatAge, isStale, latestPerStore } from './prices';
import type { PriceRecord, Store } from './types';

const now = Date.UTC(2026, 10, 9);
const rec = (storeId: string | null, priceCents: number, daysAgo: number, over: Partial<PriceRecord> = {}): PriceRecord => ({
  id: `${storeId}-${daysAgo}-${over.source ?? 'manual'}`,
  productId: 'p',
  storeId,
  priceCents,
  recordedAt: now - daysAgo * DAY_MS,
  source: 'manual',
  channel: 'store',
  estimated: false,
  ...over,
});
const stores: Store[] = [
  { id: 'rewe', name: 'REWE', builtIn: true, createdAt: 0 },
  { id: 'lidl', name: 'Lidl', builtIn: true, createdAt: 0 },
  { id: 'edeka', name: 'EDEKA', builtIn: true, createdAt: 0 },
];

describe('Preise', () => {
  it('veraltet nach Schwelle', () => {
    expect(isStale(now - 31 * DAY_MS, 30, now)).toBe(true);
    expect(isStale(now - 29 * DAY_MS, 30, now)).toBe(false);
  });

  it('neuester Preis je Markt', () => {
    const latest = latestPerStore([rec('rewe', 149, 10), rec('rewe', 159, 2), rec('lidl', 129, 5)]);
    expect(latest).toHaveLength(2);
    expect(latest.find((r) => r.storeId === 'rewe')!.priceCents).toBe(159);
  });

  it('bevorzugt aktuellen Markt, sonst neuesten', () => {
    const r = [rec('rewe', 149, 1), rec('lidl', 129, 5)];
    expect(bestKnownPrice(r, 'lidl')!.priceCents).toBe(129);
    expect(bestKnownPrice(r, 'edeka')!.priceCents).toBe(149);
    expect(bestKnownPrice([], null)).toBeNull();
  });

  it('Vergleich: Coca-Cola 1 l – REWE/Lidl/EDEKA mit Datum und Veraltet-Kennzeichen', () => {
    const rows = buildComparison([rec('rewe', 149, 3), rec('lidl', 129, 40), rec('edeka', 159, 1)], stores, 30, now);
    expect(rows.map((r) => [r.storeName, r.priceCents, r.stale])).toEqual([
      ['EDEKA', 159, false],
      ['Lidl', 129, true],
      ['REWE', 149, false],
    ]);
  });

  it('Altersangabe', () => {
    expect(formatAge(now, now)).toBe('heute');
    expect(formatAge(now - DAY_MS, now)).toBe('gestern');
    expect(formatAge(now - 5 * DAY_MS, now)).toBe('vor 5 Tagen');
    expect(formatAge(now - 65 * DAY_MS, now)).toBe('vor 2 Monaten');
  });
});

describe('Einordnung von Preisen', () => {
  const kind = (r: PriceRecord) => describePrice(r, 30, now).kind;
  it('manuell erfasst, älter, geschätzt', () => {
    expect(kind(rec('rewe', 100, 2))).toBe('manual');
    expect(kind(rec('rewe', 100, 40))).toBe('old');
    expect(kind(rec('rewe', 100, 2, { estimated: true }))).toBe('estimated');
    expect(describePrice(rec('rewe', 100, 2), 30, now).sourceLabel).toBe('Eigene Eingabe');
  });
  it('öffentliche Preise: bestätigt, ohne Beleg, online, älter', () => {
    const op = { source: 'openprices' as const, locationLabel: 'Lidl, Berlin' };
    expect(kind(rec('lidl', 99, 3, { ...op, proof: 'price_tag' }))).toBe('confirmed');
    expect(describePrice(rec('lidl', 99, 3, { ...op, proof: 'receipt' }), 30, now).sourceLabel).toBe('Open Prices · Kassenbon');
    expect(kind(rec(null, 99, 3, { ...op, proof: 'unknown' }))).toBe('unverified');
    expect(kind(rec(null, 99, 3, { ...op, channel: 'online', proof: 'receipt' }))).toBe('online');
    expect(kind(rec('lidl', 99, 90, { ...op, proof: 'price_tag' }))).toBe('old');
    expect(describePrice(rec(null, 99, 3, { ...op, channel: 'online' }), 30, now).channelLabel).toBe('Onlinepreis');
  });
  it('eigene und öffentliche Preise desselben Marktes werden getrennt gezeigt, eigene zuerst', () => {
    const rows = buildComparison(
      [rec('lidl', 129, 1), rec('lidl', 99, 2, { source: 'openprices', locationLabel: 'Lidl, Berlin', proof: 'price_tag' })],
      stores,
      30,
      now,
    );
    expect(rows.map((r) => [r.storeName, r.record.source])).toEqual([
      ['Lidl', 'manual'],
      ['Lidl, Berlin', 'openprices'],
    ]);
  });
  it('bestKnownPrice nutzt nur eigene Preise, Schätzungen zuletzt', () => {
    expect(bestKnownPrice([rec('lidl', 99, 1, { source: 'openprices' })], 'lidl')).toBeNull();
    expect(bestKnownPrice([rec('rewe', 150, 1, { estimated: true }), rec('rewe', 140, 5)], null)!.priceCents).toBe(140);
  });
});
