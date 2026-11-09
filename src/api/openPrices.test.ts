import { describe, expect, it } from 'vitest';
import { fetchOpenPrices, matchStore, parseDate, parseOpenPrices, parseOpenPricesProduct } from './openPrices';
import { OPEN_PRICES_COLA, OP_PRODUCT_COLA, OP_PRODUCT_EMPTY, mockFetch } from '../test/fixtures';
import { DEFAULT_STORES } from '../lib/types';

describe('Open Prices', () => {
  const prices = parseOpenPrices(OPEN_PRICES_COLA, DEFAULT_STORES, 123);

  it('übernimmt nur gültige EUR-Preise ohne Duplikate', () => {
    expect(prices.map((p) => p.externalId)).toEqual(['900006', '900001', '900002', '900003']);
  });

  it('Betrag in Cent, Datum, Quelle, Beleg', () => {
    const lidl = prices[1];
    expect(lidl).toMatchObject({
      priceCents: 99,
      recordedAt: Date.UTC(2026, 10, 1, 12),
      source: 'openprices',
      channel: 'store',
      storeId: 'lidl',
      locationLabel: 'Lidl, Berlin',
      countryCode: 'DE',
      proof: 'price_tag',
      fetchedAt: 123,
    });
    expect(prices[2]).toMatchObject({ priceCents: 110, storeId: null, locationLabel: 'HiperDino Express, Los Cristianos, ES', marketId: undefined, proof: 'receipt' });
  });

  it('Onlinepreis wird als solcher erkannt', () => {
    expect(prices[3]).toMatchObject({ channel: 'online', locationLabel: 'rewe.de', marketId: 'online:rewe.de', discounted: true, storeId: 'rewe' });
  });

  it('Markt-Zuordnung nur in Deutschland', () => {
    expect(matchStore('ALDI SÜD', 'DE', DEFAULT_STORES)).toBe('aldi');
    expect(matchStore('Lidl', 'FR', DEFAULT_STORES)).toBeNull();
    expect(matchStore('Netto', 'DE', DEFAULT_STORES)).toBeNull();
    expect(matchStore('Rewe City', 'DE', DEFAULT_STORES)).toBe('rewe');
  });

  it('Datum robust', () => {
    expect(parseDate('2026-01-31')).toBe(Date.UTC(2026, 0, 31, 12));
    expect(parseDate('31.01.2026')).toBeNull();
  });

  it('fragt nur für Lebensmittel ab (nicht für Kosmetik/sonstige Produkte)', async () => {
    const { impl, calls } = mockFetch({ 'prices.openfoodfacts.org': { body: OPEN_PRICES_COLA } });
    expect((await fetchOpenPrices('3600523614417', 'beauty', DEFAULT_STORES, { fetchImpl: impl })).status).toBe('skipped');
    expect((await fetchOpenPrices('1', 'product', DEFAULT_STORES, { fetchImpl: impl })).status).toBe('skipped');
    expect((await fetchOpenPrices('1', null, DEFAULT_STORES, { fetchImpl: impl })).status).toBe('skipped');
    expect(calls).toHaveLength(0);
    const r = await fetchOpenPrices('5449000000996', 'food', DEFAULT_STORES, { fetchImpl: impl });
    expect(r.status === 'ok' && r.prices).toHaveLength(4);
    expect(calls[0]).toContain('product_code=5449000000996');
    expect(calls[0]).toContain('currency=EUR');
  });
});

describe('Open Prices: Händler und Markt', () => {
  it('REWE-Filiale wird Händler REWE zugeordnet, Markt mit eindeutiger Kennung', () => {
    const rewe = parseOpenPrices(OPEN_PRICES_COLA, DEFAULT_STORES)[0];
    expect(rewe).toMatchObject({ storeId: 'rewe', locationLabel: 'REWE City, Berlin', marketId: 'osm:node:4711', priceCents: 119 });
  });
  it('Produktdaten aus Open Prices als Ausweichquelle – ohne Preis', () => {
    const r = parseOpenPricesProduct('5449000000996', OP_PRODUCT_COLA);
    expect(r).toMatchObject({ status: 'found', product: { name: 'Coca-Cola Original', productType: 'food', source: 'openfoodfacts', size: '330 ml' } });
    expect(JSON.stringify(r)).not.toMatch(/price"?:\s*\d/);
    expect(parseOpenPricesProduct('4012345678901', OP_PRODUCT_EMPTY)).toEqual({ status: 'not-found' });
  });
});
