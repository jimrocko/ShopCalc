import { describe, expect, it, vi } from 'vitest';
import { lookupBarcode, parseOffResponse } from './openFoodFacts';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('Open Food Facts', () => {
  it('liest Produktdaten (ohne Preis)', () => {
    const r = parseOffResponse('5449000000996', {
      status: 1,
      product: { product_name_de: 'Coca-Cola', brands: 'Coca-Cola, The Coca-Cola Company', quantity: '1 l', categories: 'Getränke, Softdrinks' },
    });
    expect(r).toEqual({
      status: 'found',
      product: { barcode: '5449000000996', name: 'Coca-Cola', brand: 'Coca-Cola', size: '1 l', category: 'Softdrinks', imageUrl: null },
    });
    expect(JSON.stringify(r)).not.toMatch(/price/i);
  });

  it('nicht gefunden', () => {
    expect(parseOffResponse('1', { status: 0 })).toEqual({ status: 'not-found' });
    expect(parseOffResponse('1', { status: 1, product: {} })).toEqual({ status: 'not-found' });
  });

  it('fetch: Erfolg, 404 und Netzwerkfehler', async () => {
    const ok = vi.fn(() => json({ status: 1, product: { product_name: 'Milch' } }));
    expect((await lookupBarcode('4000417025005', { fetchImpl: ok as unknown as typeof fetch })).status).toBe('found');
    expect(ok.mock.calls[0]).toBeDefined();

    const nf = vi.fn(() => json({ status: 0 }, 404));
    expect((await lookupBarcode('4000417025005', { fetchImpl: nf as unknown as typeof fetch })).status).toBe('not-found');

    const fail = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    expect((await lookupBarcode('4000417025005', { fetchImpl: fail as unknown as typeof fetch })).status).toBe('error');
  });

  it('offline ohne Anfrage', async () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const f = vi.fn();
    expect((await lookupBarcode('4000417025005', { fetchImpl: f as unknown as typeof fetch })).status).toBe('offline');
    expect(f).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
