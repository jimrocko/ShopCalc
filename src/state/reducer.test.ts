import { describe, expect, it } from 'vitest';
import { initialState, reducer, type AppState } from './reducer';
import { computeBudget } from '../lib/cart';

const ready: AppState = { ...initialState, ready: true };
const milk = { name: 'Milch', unitPriceCents: 119, quantity: 1, depositCents: 0, storeId: null, productId: null, barcode: null };

describe('App-Reducer', () => {
  it('hinzufügen, Menge ändern, entfernen', () => {
    let s = reducer(ready, { type: 'addItem', item: milk, id: 'a' });
    s = reducer(s, { type: 'changeQty', id: 'a', delta: 2 });
    expect(s.session.items[0].quantity).toBe(3);
    expect(computeBudget(s.session, 5000).totalCents).toBe(357);
    s = reducer(s, { type: 'changeQty', id: 'a', delta: -3 });
    expect(s.session.items).toHaveLength(0);
  });

  it('Preis nachträglich ändern', () => {
    let s = reducer(ready, { type: 'addItem', item: milk, id: 'a' });
    s = reducer(s, { type: 'updateItem', id: 'a', patch: { unitPriceCents: 129 } });
    expect(s.session.items[0].unitPriceCents).toBe(129);
  });

  it('Eingaben werden bei Budgetüberschreitung nicht blockiert', () => {
    let s = reducer(ready, { type: 'settings', patch: { budgetCents: 100 } });
    s = reducer(s, { type: 'addItem', item: { ...milk, unitPriceCents: 5000 } });
    s = reducer(s, { type: 'addItem', item: { ...milk, name: 'Brot', unitPriceCents: 300 } });
    expect(s.session.items).toHaveLength(2);
    expect(computeBudget(s.session, s.settings.budgetCents).remainingCents).toBe(100 - 5300);
  });

  it('Pfand hinzufügen und Rückgabe verrechnen', () => {
    let s = reducer(ready, { type: 'addDeposit', entry: { kind: 'charge', amountCents: 25, count: 6, label: 'Pfand' } });
    s = reducer(s, { type: 'addDeposit', entry: { kind: 'return', amountCents: 100, count: 1, label: 'Bon' } });
    const b = computeBudget(s.session, 5000);
    expect(b.depositCents).toBe(150);
    expect(b.depositReturnedCents).toBe(100);
    expect(b.totalCents).toBe(50);
  });

  it('Neuer Einkauf und Rückgängig', () => {
    const s1 = reducer(ready, { type: 'addItem', item: milk });
    const s2 = reducer(s1, { type: 'newSession' });
    expect(s2.session.items).toHaveLength(0);
    const s3 = reducer(s2, { type: 'restoreSession', session: s1.session });
    expect(s3.session.items).toHaveLength(1);
  });
});
