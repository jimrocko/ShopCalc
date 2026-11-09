import { describe, expect, it } from 'vitest';
import { bestKnownPrice, buildComparison, DAY_MS, formatAge, isStale, latestPerStore } from './prices';
import type { PriceRecord, Store } from './types';

const now = Date.UTC(2026, 10, 9);
const rec = (storeId: string | null, priceCents: number, daysAgo: number): PriceRecord => ({
  id: `${storeId}-${daysAgo}`,
  productId: 'p',
  storeId,
  priceCents,
  recordedAt: now - daysAgo * DAY_MS,
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
