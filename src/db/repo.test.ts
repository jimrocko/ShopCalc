import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { resetDBConnection } from './db';
import * as repo from './repo';
import { rememberProductPrice } from './remember';
import { emptySession } from '../lib/types';

beforeEach(async () => {
  await resetDBConnection();
  globalThis.indexedDB = new IDBFactory();
});

describe('Datenbank', () => {
  it('legt Standardmärkte und -einstellungen an', async () => {
    const stores = await repo.listStores();
    expect(stores.map((s) => s.name)).toEqual(['Aldi', 'Lidl', 'REWE', 'EDEKA', 'Kaufland']);
    const settings = await repo.loadSettings();
    expect(settings.budgetCents).toBe(5000);
  });

  it('Sitzung bleibt nach "Neuladen" erhalten', async () => {
    const s = emptySession();
    s.items.push({ id: 'x', name: 'Milch', unitPriceCents: 119, quantity: 2, depositCents: 0, storeId: null, productId: null, barcode: null, addedAt: 1 });
    await repo.saveSession(s);
    await repo.saveSettings({ ...(await repo.loadSettings()), budgetCents: 2000 });
    await resetDBConnection(); // simuliert Neuladen der Seite
    expect((await repo.loadSession()).items[0].name).toBe('Milch');
    expect((await repo.loadSettings()).budgetCents).toBe(2000);
  });

  it('eigene Märkte hinzufügen, keine Duplikate', async () => {
    const a = await repo.addStore('Netto');
    const b = await repo.addStore('netto ');
    expect(a.id).toBe(b.id);
    expect((await repo.listStores()).at(-1)!.name).toBe('Netto');
  });

  it('Produkt per Barcode speichern und finden', async () => {
    const p = await repo.upsertProduct({ name: 'Coca-Cola', barcode: '5449000000996', size: '1 l', brand: 'Coca-Cola' });
    expect((await repo.findProductByBarcode('5449000000996'))!.id).toBe(p.id);
    // Upsert mit gleichem Barcode aktualisiert statt dupliziert
    await repo.upsertProduct({ name: 'Coca-Cola Classic', barcode: '5449000000996' });
    const all = await repo.listProducts();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Coca-Cola Classic');
    expect(all[0].size).toBe('1 l');
  });

  it('Preise je Markt mit Datum, gleiche Preise nicht doppelt', async () => {
    const p = await repo.upsertProduct({ name: 'Butter' });
    await repo.recordPrice(p.id, 'rewe', 229, 1000);
    await repo.recordPrice(p.id, 'rewe', 229, 2000);
    await repo.recordPrice(p.id, 'lidl', 199, 1500);
    await repo.recordPrice(p.id, 'rewe', 239, 3000);
    const prices = await repo.listPrices(p.id);
    expect(prices.map((x) => [x.storeId, x.priceCents, x.recordedAt])).toEqual([
      ['rewe', 239, 3000],
      ['rewe', 229, 2000],
      ['lidl', 199, 1500],
    ]);
  });

  it('lehnt ungültige Preise ab', async () => {
    const p = await repo.upsertProduct({ name: 'X' });
    await expect(repo.recordPrice(p.id, null, 1.5)).rejects.toThrow();
    await expect(repo.recordPrice(p.id, null, -1)).rejects.toThrow();
  });

  it('Produkt löschen entfernt auch Preise', async () => {
    const p = await repo.upsertProduct({ name: 'Brot' });
    await repo.recordPrice(p.id, null, 299);
    await repo.deleteProduct(p.id);
    expect(await repo.listProducts()).toHaveLength(0);
    expect(await repo.listAllPrices()).toHaveLength(0);
  });

  it('rememberProductPrice erkennt Produkt am Namen wieder', async () => {
    const id1 = await rememberProductPrice({ productId: null, barcode: null, name: 'Milch', storeId: 'aldi', priceCents: 99 });
    const id2 = await rememberProductPrice({ productId: null, barcode: null, name: 'milch', storeId: 'rewe', priceCents: 119 });
    expect(id1).toBe(id2);
    expect(await repo.listPrices(id1!)).toHaveLength(2);
    expect(await rememberProductPrice({ productId: null, barcode: null, name: '  ', storeId: null, priceCents: 100 })).toBeNull();
  });

  it('Export und Import', async () => {
    const p = await repo.upsertProduct({ name: 'Käse', barcode: '96385074' });
    await repo.recordPrice(p.id, 'edeka', 349);
    await repo.addStore('Penny');
    const backup = await repo.exportAll();

    await resetDBConnection();
    globalThis.indexedDB = new IDBFactory();
    const res = await repo.importAll(JSON.parse(JSON.stringify(backup)));
    expect(res).toEqual({ products: 1, prices: 1, stores: 6 });
    expect((await repo.findProductByBarcode('96385074'))!.name).toBe('Käse');
    await expect(repo.importAll({ foo: 1 })).rejects.toThrow();
  });
});
