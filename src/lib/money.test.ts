import { describe, expect, it } from 'vitest';
import { eurosToCents, formatCents, formatCentsPlain, multiply, parseMoney } from './money';

describe('parseMoney', () => {
  it.each([
    ['1,19', 119],
    ['1.19', 119],
    ['1', 100],
    ['0,5', 50],
    [',99', 99],
    ['12,3', 1230],
    ['1.234,56', 123456],
    ['1,234.56', 123456],
    ['1.234.567', 123456700],
    ['2,49 €', 249],
    ['€ 2,49', 249],
    [' 3 ', 300],
    ['0', 0],
    ['1,005', 101],
    ['1,004', 100],
  ])('%s → %d Cent', (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each(['', 'abc', '1,2,3', '1..2', '-', '1,2a'])('lehnt "%s" ab', (input) => {
    expect(parseMoney(input)).toBeNull();
  });

  it('negative Beträge nur wenn erlaubt', () => {
    expect(parseMoney('-3,40')).toBeNull();
    expect(parseMoney('-3,40', { allowNegative: true })).toBe(-340);
  });
});

describe('formatCents', () => {
  it('formatiert deutsch mit Euro', () => {
    expect(formatCents(447)).toMatch(/^4,47\s€$/);
    expect(formatCents(5000)).toMatch(/^50,00\s€$/);
    expect(formatCents(123456)).toMatch(/^1\.234,56\s€$/);
    expect(formatCents(-340)).toMatch(/^-3,40\s€$/);
  });
  it('formatCentsPlain ohne Tausenderpunkt', () => {
    expect(formatCentsPlain(123456)).toBe('1234,56');
    expect(formatCentsPlain(119)).toBe('1,19');
  });
});

describe('Cent-Arithmetik', () => {
  it('149 Cent × 3 = 447 Cent', () => {
    expect(multiply(149, 3)).toBe(447);
  });
  it('keine Gleitkommafehler beim Summieren', () => {
    const sum = [10, 20, 30].reduce((a, b) => a + b, 0); // 0,10 + 0,20 + 0,30
    expect(sum).toBe(60);
  });
  it('eurosToCents rundet kaufmännisch', () => {
    expect(eurosToCents(0.1 + 0.2)).toBe(30);
    expect(eurosToCents(1.005)).toBe(101);
    expect(eurosToCents(2.675)).toBe(268);
    expect(eurosToCents(-1.5)).toBe(-150);
    expect(eurosToCents(NaN)).toBeNull();
  });
  it('multiply verlangt ganzzahlige Menge', () => {
    expect(() => multiply(100, 1.5)).toThrow();
  });
});
