import { describe, expect, it } from 'vitest';
import { isSupportedBarcode, isValidGtin, normalizeBarcode } from './barcode';

describe('Barcode', () => {
  it('gültige EAN-13', () => {
    expect(isValidGtin('4000417025005')).toBe(true);
    expect(isValidGtin('5449000000996')).toBe(true);
    expect(isValidGtin('4000417025006')).toBe(false);
  });
  it('gültige EAN-8', () => {
    expect(isValidGtin('96385074')).toBe(true);
    expect(isValidGtin('96385075')).toBe(false);
  });
  it('UPC-A wird zu EAN-13', () => {
    expect(normalizeBarcode('036000291452')).toBe('0036000291452');
    expect(isSupportedBarcode('036000291452')).toBe(true);
  });
  it('lehnt anderes ab', () => {
    expect(isSupportedBarcode('123')).toBe(false);
    expect(isSupportedBarcode('abcdefgh')).toBe(false);
  });
});
