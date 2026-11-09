import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { DB_NAME, resetDBConnection } from '../db/db';
import * as repo from '../db/repo';
import { loadPrices, refreshExternalPrices, resolveProduct, saveManualPrice, suggestPrice } from './scanLookup';
import { BEAUTY_LOREAL, EMPTY_PRODUCT, FOOD_COLA, OPEN_PRICES_COLA, OPEN_PRICES_EMPTY, mockFetch } from '../test/fixtures';
import { DAY_MS } from '../lib/prices';
import { DEFAULT_STORES } from '../lib/types';

beforeEach(async () => {
  await resetDBConnection();
  globalThis.indexedDB = new IDBFactory();
});

const NOW = Date.UTC(2026, 10, 9, 12);

describe('Scan: Lebensmittel', () => {
  it('erkennt das Produkt und findet öffentliche Preise mit Quelle und Datum', async () => {
    const { impl, calls } = mockFetch({
      'api/v3/product/5449000000996': { body: FOOD_COLA },
      'prices.openfoodfacts.org': { body: OPEN_PRICES_COLA },
    });
    const res = await resolveProduct('5449000000996', { useFacts: true, fetchImpl: impl });
    expect(res.status).toBe('found');
    expect(res.product).toMatchObject({ name: 'Coca-Cola', productType: 'food', source: 'openfoodfacts', size: '330 ml' });
    expect(res.product!.imageUrl).toContain('images.openfoodfacts.org');

    const pr = await refreshExternalPrices(res.product!, { useOpenPrices: true, stores: DEFAULT_STORES, fetchImpl: impl });
    expect(pr).toEqual({ status: 'ok', found: 4 });
    expect(calls).toHaveLength(2);

    const prices = await loadPrices(res.product);
    expect(prices.every((p) => p.source === 'openprices' && p.recordedAt > 0)).toBe(true);
    // Vorschlag ohne gewählten Händler: neuester belegter Filialpreis aus Deutschland (REWE 1,19 €) – nicht online, nicht Ausland
    expect(suggestPrice(prices, null, 30, NOW)).toMatchObject({ priceCents: 119, storeId: 'rewe', proof: 'price_tag' });
    // Mit gewähltem Händler Lidl: dessen Filialpreis
    expect(suggestPrice(prices, 'lidl', 30, NOW)).toMatchObject({ priceCents: 99, storeId: 'lidl' });

    // Erneuter Abruf erzeugt keine Duplikate
    await refreshExternalPrices(res.product!, { useOpenPrices: true, stores: DEFAULT_STORES, fetchImpl: impl });
    expect(await loadPrices(res.product)).toHaveLength(4);
  });

  it('eigene Preise haben Vorrang (1. lokal)', async () => {
    const { impl } = mockFetch({ 'api/v3': { body: FOOD_COLA }, 'prices.openfoodfacts.org': { body: OPEN_PRICES_COLA } });
    const { product } = await resolveProduct('5449000000996', { useFacts: true, fetchImpl: impl });
    await refreshExternalPrices(product!, { useOpenPrices: true, stores: DEFAULT_STORES, fetchImpl: impl });
    await repo.recordPrice(product!.id, 'rewe', 119, NOW - DAY_MS);
    const s = suggestPrice(await loadPrices(product), 'rewe', 30, NOW);
    expect(s).toMatchObject({ priceCents: 119, source: 'manual' });
  });

  it('ohne passenden Preis → keine Vorauswahl (manuelle Eingabe)', async () => {
    const { impl } = mockFetch({ 'api/v3': { body: FOOD_COLA }, 'prices.openfoodfacts.org': { body: OPEN_PRICES_EMPTY } });
    const { product } = await resolveProduct('5449000000996', { useFacts: true, fetchImpl: impl });
    const pr = await refreshExternalPrices(product!, { useOpenPrices: true, stores: DEFAULT_STORES, fetchImpl: impl });
    expect(pr).toEqual({ status: 'ok', found: 0 });
    expect(suggestPrice(await loadPrices(product), null, 30, NOW)).toBeNull();
  });

  it('alte, geschätzte und Onlinepreise werden nie automatisch gewählt', async () => {
    const p = await repo.upsertProduct({ name: 'X', barcode: '96385074' });
    await repo.recordPrice(p.id, 'rewe', 100, NOW - 90 * DAY_MS);
    await repo.recordPrice(p.id, 'lidl', 120, NOW - DAY_MS, { estimated: true });
    await repo.saveExternalPrices(p.id, [
      { externalId: '1', source: 'openprices', channel: 'online', storeId: null, priceCents: 90, recordedAt: NOW - DAY_MS, proof: 'receipt', countryCode: 'DE' },
    ]);
    expect(suggestPrice(await loadPrices(p), null, 30, NOW)).toBeNull();
  });
});

describe('Scan: Kosmetik', () => {
  it('wird über Open Beauty Facts erkannt, Open Prices wird NICHT abgefragt', async () => {
    const { impl, calls } = mockFetch({ 'api/v3/product/3600523614417': { body: BEAUTY_LOREAL }, 'prices.openfoodfacts.org': { body: OPEN_PRICES_COLA } });
    const res = await resolveProduct('3600523614417', { useFacts: true, fetchImpl: impl });
    expect(res.product).toMatchObject({ source: 'openbeautyfacts', productType: 'beauty' });
    const pr = await refreshExternalPrices(res.product!, { useOpenPrices: true, stores: DEFAULT_STORES, fetchImpl: impl });
    expect(pr.status).toBe('skipped-not-food');
    expect(calls.some((c) => c.includes('prices.openfoodfacts.org'))).toBe(false);
    expect(await loadPrices(res.product)).toHaveLength(0);
  });

  it('manueller Preis wird mit Barcode, Name, Markt, Datum gespeichert und beim nächsten Scan vorgeschlagen', async () => {
    const { impl } = mockFetch({ 'api/v3': { body: BEAUTY_LOREAL } });
    const { product } = await resolveProduct('3600523614417', { useFacts: true, fetchImpl: impl });
    const pid = await saveManualPrice({ barcode: '3600523614417', product, name: '', storeId: 'rewe', priceCents: 1299, estimated: false });
    expect(pid).toBe(product!.id);
    const again = await resolveProduct('3600523614417', { useFacts: true, fetchImpl: impl });
    const prices = await loadPrices(again.product);
    expect(prices[0]).toMatchObject({ priceCents: 1299, storeId: 'rewe', source: 'manual', channel: 'store', estimated: false });
    expect(Math.abs(prices[0].recordedAt - Date.now())).toBeLessThan(5000);
    expect(suggestPrice(prices, 'rewe', 30)).toMatchObject({ priceCents: 1299 });
  });
});

describe('Scan: unbekannter Barcode', () => {
  it('kein Produkt → manuelle Eingabe legt Produkt an', async () => {
    const { impl } = mockFetch({ 'api/v3/product/2000000000008': { body: EMPTY_PRODUCT } });
    const res = await resolveProduct('2000000000008', { useFacts: true, fetchImpl: impl });
    expect(res).toMatchObject({ product: null, status: 'not-found' });
    expect(res.reports.map((r) => [r.id, r.status])).toEqual([
      ['local-product', 'empty'],
      ['openfacts', 'empty'],
      ['openprices-product', 'empty'],
    ]);
    const pid = await saveManualPrice({ barcode: '2000000000008', product: null, name: 'Deo Spray', storeId: 'aldi', priceCents: 195, estimated: true });
    const p = (await repo.findProductByBarcode('2000000000008'))!;
    expect(p.id).toBe(pid);
    expect(p.name).toBe('Deo Spray');
    expect((await repo.listPrices(p.id))[0]).toMatchObject({ priceCents: 195, storeId: 'aldi', estimated: true });
  });

  it('ohne Namen wird ein Platzhalter verwendet, der später durch Online-Daten ersetzt wird', async () => {
    await saveManualPrice({ barcode: '5449000000996', product: null, name: '', storeId: null, priceCents: 100, estimated: false });
    expect((await repo.findProductByBarcode('5449000000996'))!.name).toBe('Produkt 5449000000996');
    const { impl } = mockFetch({ 'api/v3': { body: FOOD_COLA } });
    const res = await resolveProduct('5449000000996', { useFacts: true, fetchImpl: impl });
    expect(res.product!.name).toBe('Coca-Cola');
    expect(res.product!.productType).toBe('food');
  });

  it('offline: Ergebnis "offline", lokal gespeicherte Produkte bleiben verfügbar', async () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect((await resolveProduct('4012345678901', { useFacts: true })).status).toBe('offline');
    await repo.upsertProduct({ name: 'Milch', barcode: '96385074', productType: 'food', imageUrl: 'x' });
    expect((await resolveProduct('96385074', { useFacts: true })).product!.name).toBe('Milch');
    spy.mockRestore();
  });

  it('selbst angelegte Angaben werden durch Online-Daten nicht überschrieben', async () => {
    await repo.upsertProduct({ name: 'Meine Cola', barcode: '5449000000996', size: '0,33 l' });
    const { impl } = mockFetch({ 'api/v3': { body: FOOD_COLA } });
    const res = await resolveProduct('5449000000996', { useFacts: true, fetchImpl: impl });
    expect(res.product).toMatchObject({ name: 'Meine Cola', size: '0,33 l', brand: 'COCA-COLA SERVICES SA/NV', productType: 'food', source: 'user' });
  });
});

describe('Datenbank-Migration v1 → v2', () => {
  it('bestehende Preise werden als manuelle Filialpreise übernommen', async () => {
    const v1 = await openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('products', { keyPath: 'id' }).createIndex('barcode', 'barcode');
        db.createObjectStore('prices', { keyPath: 'id' }).createIndex('productId', 'productId');
        db.createObjectStore('stores', { keyPath: 'id' });
        db.createObjectStore('settings', { keyPath: 'id' });
        db.createObjectStore('session', { keyPath: 'id' });
      },
    });
    await v1.put('products', { id: 'p1', barcode: '96385074', name: 'Butter', brand: '', category: '', size: '', source: 'openfoodfacts', createdAt: 1, updatedAt: 1 });
    await v1.put('prices', { id: 'r1', productId: 'p1', storeId: 'rewe', priceCents: 229, recordedAt: 1000 });
    v1.close();

    const prices = await repo.listPrices('p1');
    expect(prices[0]).toEqual({ id: 'r1', productId: 'p1', storeId: 'rewe', priceCents: 229, recordedAt: 1000, source: 'manual', channel: 'store', estimated: false });
    const p = (await repo.getProduct('p1'))!;
    expect(p).toMatchObject({ productType: 'food', imageUrl: null });
  });
});
