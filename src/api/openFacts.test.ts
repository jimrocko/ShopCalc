import { describe, expect, it, vi } from 'vitest';
import { lookupProduct, parseFactsResponse } from './openFacts';
import { BEAUTY_LOREAL, EMPTY_PRODUCT, FOOD_COLA, NOT_FOUND, PRODUCT_OTHER, mockFetch } from '../test/fixtures';

describe('Produkterkennung (Open Food/Beauty/Products Facts)', () => {
  it('Lebensmittel: Open Food Facts mit deutschem Namen, Bild, Größe', () => {
    const r = parseFactsResponse('5449000000996', FOOD_COLA);
    expect(r).toEqual({
      status: 'found',
      product: {
        barcode: '5449000000996',
        name: 'Coca-Cola',
        brand: 'COCA-COLA SERVICES SA/NV',
        size: '330 ml',
        category: 'Colas',
        imageUrl: FOOD_COLA.product.image_front_small_url,
        productType: 'food',
        source: 'openfoodfacts',
      },
    });
  });

  it('Kosmetik: Open Beauty Facts, Meta-Kategorien werden ausgeblendet', () => {
    const r = parseFactsResponse('3600523614417', BEAUTY_LOREAL);
    expect(r.status).toBe('found');
    if (r.status !== 'found') return;
    expect(r.product.source).toBe('openbeautyfacts');
    expect(r.product.productType).toBe('beauty');
    expect(r.product.category).toBe('');
    expect(r.product.imageUrl).toContain('openbeautyfacts');
  });

  it('Sonstige Produkte: Open Products Facts', () => {
    const r = parseFactsResponse('4006381333931', PRODUCT_OTHER);
    expect(r.status === 'found' && r.product.source).toBe('openproductsfacts');
  });

  it('Unbekannte Barcodes', () => {
    expect(parseFactsResponse('2000000000008', EMPTY_PRODUCT)).toEqual({ status: 'not-found' });
    expect(parseFactsResponse('4012345678901', NOT_FOUND)).toEqual({ status: 'not-found' });
  });

  it('verwendet die universelle Abfrage product_type=all (v3)', async () => {
    const { impl, calls } = mockFetch({ '3600523614417': { body: BEAUTY_LOREAL } });
    const r = await lookupProduct('3600523614417', { fetchImpl: impl });
    expect(r.status).toBe('found');
    expect(calls[0]).toMatch(/^https:\/\/world\.openfoodfacts\.org\/api\/v3\/product\/3600523614417\?product_type=all/);
  });

  it('404 = nicht gefunden, Netzwerkfehler = error, offline = ohne Anfrage', async () => {
    const { impl } = mockFetch({ x: { body: {} } });
    expect((await lookupProduct('4012345678901', { fetchImpl: impl })).status).toBe('not-found');
    const fail = (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
    expect((await lookupProduct('4012345678901', { fetchImpl: fail })).status).toBe('error');
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const f = vi.fn();
    expect((await lookupProduct('4012345678901', { fetchImpl: f as unknown as typeof fetch })).status).toBe('offline');
    expect(f).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('enthält niemals Preise', () => {
    expect(JSON.stringify(parseFactsResponse('5449000000996', FOOD_COLA))).not.toMatch(/price/i);
  });
});
