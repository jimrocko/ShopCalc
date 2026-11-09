/** Prüft die GTIN-Prüfziffer (EAN-8, EAN-13, UPC-A). */
export function isValidGtin(code: string): boolean {
  if (!/^\d+$/.test(code)) return false;
  if (![8, 12, 13].includes(code.length)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  let sum = 0;
  // Gewichtung von rechts: 3,1,3,1,…
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i] * w;
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Normalisiert eine GTIN, damit dasselbe Produkt immer denselben Schlüssel hat:
 * UPC-A (12-stellig) → EAN-13, GTIN-14 mit führender 0 → EAN-13.
 */
export function normalizeBarcode(code: string): string {
  const c = code.replace(/\D/g, '');
  if (c.length === 12) return `0${c}`;
  if (c.length === 14 && c.startsWith('0')) return c.slice(1);
  return c;
}

export function isSupportedBarcode(code: string): boolean {
  const c = normalizeBarcode(code);
  return (c.length === 8 || c.length === 13) && isValidGtin(c);
}
