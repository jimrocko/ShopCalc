import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { resetDBConnection } from '../db/db';
import * as repo from '../db/repo';
import { findRemoteProduct } from './productSources';
import { runPriceSources } from './priceSources';
import { lookupPrices, loadPrices, resolveProduct, suggestPrice } from '../services/scanLookup';
import { FOOD_COLA, OPEN_PRICES_COLA, OP_PRODUCT_COLA, mockFetch } from '../test/fixtures';
import { DEFAULT_STORES } from '../lib/types';
import { DAY_MS } from '../lib/prices';

beforeEach(async () => {
  await resetDBConnection();
  globalThis.indexedDB = new IDBFactory();
});

const NOW = Date.UTC(2026, 10, 9, 12);

describe('Produktquellen', () => {
  it('Ausweichquelle Open Prices, wenn Open Food Facts nicht erreichbar ist', async () => {
    const { impl, calls } = mockFetch({
      'world.openfoodfacts.org': { status: 503, body: {} },
      'prices.openfoodfacts.org/api/v1/products/code/': { body: OP_PRODUCT_COLA },
    });
    const r = await findRemoteProduct('5449000000996', impl);
    expect(r.product?.name).toBe('Coca-Cola Original');
    expect(r.reports.map((x) => [x.id, x.status])).toEqual([
      ['openfacts', 'error'],
      ['openprices-product', 'ok'],
    ]);
    expect(calls).toHaveLength(2);
  });

  it('kein zweiter Aufruf, wenn die erste Quelle das Produkt kennt', async () => {
    const { impl, calls } = mockFetch({ 'world.openfoodfacts.org': { body: FOOD_COLA } });
    expect((await findRemoteProduct('5449000000996', impl)).product?.source).toBe('openfoodfacts');
    expect(calls).toHaveLength(1);
  });

  it('offline: Status offline, keine weiteren Versuche', async () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      const r = await findRemoteProduct('5449000000996');
      expect(r.status).toBe('offline');
      expect(r.reports).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('Fehler einer Quelle (Exception) wird abgefangen', async () => {
    const boom = (() => {
      throw new Error('kaputt');
    }) as unknown as typeof fetch;
    const r = await findRemoteProduct('5449000000996', boom);
    expect(r.product).toBeNull();
    expect(r.reports.every((x) => x.status === 'error')).toBe(true);
  });
});

describe('Preisquellen', () => {
  async function cola() {
    const { impl } = mockFetch({ 'world.openfoodfacts.org': { body: FOOD_COLA } });
    return (await resolveProduct('5449000000996', { useFacts: true, fetchImpl: impl })).product!;
  }

  it('Open-Prices-Fehler blockiert eigene Preise nicht; REWE/EDEKA ohne Netzwerkzugriff als „nicht verfügbar“', async () => {
    const product = await cola();
    await repo.recordPrice(product.id, 'edeka', 105);
    const { impl, calls } = mockFetch({ 'prices.openfoodfacts.org': { status: 500, body: {} } });
    const reports = await runPriceSources(product, { useOpenPrices: true, stores: DEFAULT_STORES, currentStoreId: 'edeka', fetchImpl: impl });
    expect(reports.map((r) => [r.id, r.status])).toEqual([
      ['local', 'ok'],
      ['openprices', 'error'],
      ['rewe-api', 'unavailable'],
      ['edeka-api', 'unavailable'],
    ]);
    expect(calls.every((c) => c.includes('openfoodfacts.org'))).toBe(true);
    expect(calls.some((c) => /rewe\.de|edeka\.de/.test(c))).toBe(false);
    expect((await loadPrices(product))[0].priceCents).toBe(105);
  });

  it('meldet Treffer beim gewählten Händler', async () => {
    const product = await cola();
    const { impl } = mockFetch({ 'prices.openfoodfacts.org': { body: OPEN_PRICES_COLA } });
    const reports = await lookupPrices(product, { useOpenPrices: true, stores: DEFAULT_STORES, currentStoreId: 'rewe', fetchImpl: impl });
    const op = reports.find((r) => r.id === 'openprices')!;
    expect(op.status).toBe('ok');
    expect(op.detail).toBe('4 Preise · 2 aus deutschen Filialen · 2 beim gewählten Händler');
  });

  it('Vorauswahl: Preis beim gewählten Händler zuerst, Onlinepreis nie', async () => {
    const product = await cola();
    const { impl } = mockFetch({ 'prices.openfoodfacts.org': { body: OPEN_PRICES_COLA } });
    await lookupPrices(product, { useOpenPrices: true, stores: DEFAULT_STORES, fetchImpl: impl });
    await repo.recordPrice(product.id, 'lidl', 95, NOW - DAY_MS);
    const prices = await loadPrices(product);
    // Bei REWE: belegter REWE-Filialpreis (1,19 €) schlägt eigenen Lidl-Preis; REWE-Onlinepreis (1,29 €) wird nicht gewählt
    expect(suggestPrice(prices, 'rewe', 30, NOW)).toMatchObject({ priceCents: 119, storeId: 'rewe', channel: 'store' });
    expect(suggestPrice(prices, 'lidl', 30, NOW)).toMatchObject({ priceCents: 95, source: 'manual' });
    expect(suggestPrice(prices, null, 30, NOW)).toMatchObject({ priceCents: 95 });
  });
});

describe('Doppelte Produkte (GTIN/EAN)', () => {
  it('UPC-A und EAN-13 bzw. GTIN-14 desselben Produkts werden zusammengeführt', async () => {
    const db = await (await import('../db/db')).getDB();
    const base = { brand: '', category: '', size: '', source: 'user', productType: null, imageUrl: null };
    await db.put('products', { ...base, id: 'a', barcode: '036000291452', name: 'Alt', createdAt: 1, updatedAt: 1 } as never);
    await db.put('products', { ...base, id: 'b', barcode: '0036000291452', name: '', size: '500 g', createdAt: 2, updatedAt: 2 } as never);
    await db.put('products', { ...base, id: 'c', barcode: '00036000291452', name: 'Neu', createdAt: 3, updatedAt: 3 } as never);
    await repo.recordPrice('b', 'rewe', 199);
    await repo.recordPrice('c', 'edeka', 209);

    expect(await repo.mergeDuplicateProducts()).toBe(2);
    const all = await repo.listProducts();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 'a', barcode: '0036000291452', name: 'Alt', size: '500 g' });
    expect((await repo.listPrices('a')).map((p) => p.priceCents).sort()).toEqual([199, 209]);
    expect((await repo.findProductByBarcode('036000291452'))!.id).toBe('a');
    expect(await repo.mergeDuplicateProducts()).toBe(0);
  });
});
