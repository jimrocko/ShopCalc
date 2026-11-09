import { describe, expect, it } from 'vitest';
import { addItem, computeBudget, computeTotals, mergeAll, type NewItem } from './cart';
import type { CartItem, DepositEntry } from './types';

const base: NewItem = { name: 'Milch', unitPriceCents: 119, quantity: 2, depositCents: 0, storeId: null, productId: null, barcode: null };
const item = (p: Partial<CartItem> = {}): CartItem => ({ ...base, id: Math.random().toString(), addedAt: 0, ...p });
const dep = (p: Partial<DepositEntry>): DepositEntry => ({ id: 'd', kind: 'charge', label: '', amountCents: 25, count: 1, addedAt: 0, ...p });

describe('computeTotals', () => {
  it('Milch 2 × 1,19 € = 2,38 €', () => {
    expect(computeTotals({ items: [item()], deposits: [] }).totalCents).toBe(238);
  });

  it('trennt Warenwert und Pfand', () => {
    const t = computeTotals({
      items: [item({ unitPriceCents: 89, quantity: 6, depositCents: 25 })],
      deposits: [dep({ kind: 'charge', amountCents: 150, count: 1 }), dep({ kind: 'return', amountCents: 320, count: 1 })],
    });
    expect(t.goodsCents).toBe(534);
    expect(t.depositCents).toBe(150 + 150);
    expect(t.depositReturnedCents).toBe(320);
    expect(t.totalCents).toBe(534 + 300 - 320);
    expect(t.itemCount).toBe(6);
  });

  it('leerer Einkauf = 0', () => {
    expect(computeTotals({ items: [], deposits: [] }).totalCents).toBe(0);
  });
});

describe('computeBudget', () => {
  it('Budget 50 €, ausgegeben 18,75 € → 31,25 € verfügbar', () => {
    const b = computeBudget({ items: [item({ unitPriceCents: 1875, quantity: 1 })], deposits: [] }, 5000);
    expect(b.totalCents).toBe(1875);
    expect(b.remainingCents).toBe(3125);
    expect(b.overBudget).toBe(false);
    expect(b.level).toBe('ok');
  });

  it('Überschreitung: 53,40 € bei 50 € → −3,40 €', () => {
    const b = computeBudget({ items: [item({ unitPriceCents: 5340, quantity: 1 })], deposits: [] }, 5000);
    expect(b.remainingCents).toBe(-340);
    expect(b.overBudget).toBe(true);
    expect(b.level).toBe('over');
  });

  it('Vorwarnung ab 90 %', () => {
    expect(computeBudget({ items: [item({ unitPriceCents: 4500, quantity: 1 })], deposits: [] }, 5000).level).toBe('near');
    expect(computeBudget({ items: [item({ unitPriceCents: 4499, quantity: 1 })], deposits: [] }, 5000).level).toBe('ok');
    expect(computeBudget({ items: [item({ unitPriceCents: 5000, quantity: 1 })], deposits: [] }, 5000).level).toBe('near');
  });

  it('Budget 0 erlaubt', () => {
    const b = computeBudget({ items: [item({ unitPriceCents: 100, quantity: 1 })], deposits: [] }, 0);
    expect(b.remainingCents).toBe(-100);
    expect(b.level).toBe('over');
  });

  it('Pfandrückgabe kann Summe senken', () => {
    const b = computeBudget({ items: [], deposits: [dep({ kind: 'return', amountCents: 300 })] }, 1000);
    expect(b.totalCents).toBe(-300);
    expect(b.remainingCents).toBe(1300);
  });
});

describe('addItem / Zusammenfassen', () => {
  it('fasst gleiche Produkte zusammen', () => {
    let r = addItem([], base, { merge: true, id: 'a' });
    r = addItem(r.items, { ...base, quantity: 3 }, { merge: true, id: 'b' });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].quantity).toBe(5);
    expect(r.merged).toBe(true);
  });

  it('Groß-/Kleinschreibung beim Namen egal', () => {
    let r = addItem([], base, { merge: true, id: 'a' });
    r = addItem(r.items, { ...base, name: ' milch ' }, { merge: true, id: 'b' });
    expect(r.items).toHaveLength(1);
  });

  it('fasst nicht zusammen bei anderem Preis, Pfand oder Markt', () => {
    let items = addItem([], base, { merge: true, id: 'a' }).items;
    items = addItem(items, { ...base, unitPriceCents: 129 }, { merge: true, id: 'b' }).items;
    items = addItem(items, { ...base, depositCents: 25 }, { merge: true, id: 'c' }).items;
    items = addItem(items, { ...base, storeId: 'lidl' }, { merge: true, id: 'd' }).items;
    expect(items).toHaveLength(4);
  });

  it('namenlose Positionen bleiben getrennt', () => {
    let items = addItem([], { ...base, name: '' }, { merge: true, id: 'a' }).items;
    items = addItem(items, { ...base, name: '' }, { merge: true, id: 'b' }).items;
    expect(items).toHaveLength(2);
  });

  it('gleicher Barcode wird zusammengefasst, auch bei anderem Namen', () => {
    let items = addItem([], { ...base, barcode: '4000417025005', name: 'A' }, { merge: true, id: 'a' }).items;
    items = addItem(items, { ...base, barcode: '4000417025005', name: 'B' }, { merge: true, id: 'b' }).items;
    expect(items).toHaveLength(1);
  });

  it('ohne merge immer neue Zeile', () => {
    let items = addItem([], base, { merge: false, id: 'a' }).items;
    items = addItem(items, base, { merge: false, id: 'b' }).items;
    expect(items).toHaveLength(2);
    expect(mergeAll(items)).toHaveLength(1);
    expect(mergeAll(items)[0].quantity).toBe(4);
  });

  it('Menge wird begrenzt und gerundet', () => {
    expect(addItem([], { ...base, quantity: 0 }, { merge: false }).items[0].quantity).toBe(1);
    expect(addItem([], { ...base, quantity: 2.6 }, { merge: false }).items[0].quantity).toBe(3);
    expect(addItem([], { ...base, quantity: 1e9 }, { merge: false }).items[0].quantity).toBe(9999);
  });
});
