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

/** Normalisiert UPC-A (12-stellig) auf EAN-13. */
export function normalizeBarcode(code: string): string {
  const c = code.replace(/\D/g, '');
  return c.length === 12 ? `0${c}` : c;
}

export function isSupportedBarcode(code: string): boolean {
  const c = normalizeBarcode(code);
  return (c.length === 8 || c.length === 13) && isValidGtin(c);
}
