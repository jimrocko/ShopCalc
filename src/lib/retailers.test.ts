import { describe, expect, it } from 'vitest';
import { matchRetailer } from './retailers';
import { DEFAULT_STORES } from './types';

const stores = [...DEFAULT_STORES, { id: 'x1', name: 'Netto' }];

describe('Händler-Zuordnung', () => {
  it.each([
    ['REWE', '', 'rewe'],
    ['Rewe', 'REWE City', 'rewe'],
    ['', 'REWE Center Hamburg', 'rewe'],
    ['EDEKA', 'EDEKA Müller', 'edeka'],
    ['Edeka', 'E-Center', 'edeka'],
    ['', 'E center Wiesbaden', 'edeka'],
    ['ALDI SÜD', '', 'aldi'],
    ['', 'Lidl', 'lidl'],
    ['Kaufland', '', 'kaufland'],
    ['', 'Netto Marken-Discount', 'x1'],
  ])('%s / %s → %s', (brand, name, expected) => {
    expect(matchRetailer(brand, name, 'DE', stores)).toBe(expected);
  });

  it('keine Fehlzuordnung bei ähnlichen Wörtern oder im Ausland', () => {
    expect(matchRetailer('', 'Edekamp Kiosk', 'DE', stores)).toBeNull();
    expect(matchRetailer('', 'Ecenter Moda', 'DE', stores)).toBeNull();
    expect(matchRetailer('Lidl', 'Lidl', 'FR', stores)).toBeNull();
    expect(matchRetailer('', '', 'DE', stores)).toBeNull();
  });
});
