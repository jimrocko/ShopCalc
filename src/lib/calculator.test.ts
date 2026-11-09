import { describe, expect, it } from 'vitest';
import { calcReducer, formatDisplay, initialCalcState, subtotalSum, type CalcAction, type CalcState } from './calculator';

function run(keys: string, state: CalcState = initialCalcState): CalcState {
  const actions: CalcAction[] = [];
  for (const k of keys.split(' ').filter(Boolean)) {
    if (/^\d+$/.test(k)) for (const d of k) actions.push({ type: 'digit', digit: d });
    else if (k === ',') actions.push({ type: 'decimal' });
    else if (k === '+' || k === '-' || k === '×' || k === '÷') actions.push({ type: 'op', op: k });
    else if (k === '=') actions.push({ type: 'equals' });
    else if (k === '%') actions.push({ type: 'percent' });
    else if (k === 'R') actions.push({ type: 'discount' });
    else if (k === 'ZS') actions.push({ type: 'subtotal' });
    else if (k === '⌫') actions.push({ type: 'backspace' });
    else if (k === 'AC') actions.push({ type: 'allClear' });
    else if (k === '±') actions.push({ type: 'toggleSign' });
    else throw new Error(k);
  }
  return actions.reduce(calcReducer, state);
}

describe('Taschenrechner', () => {
  it('Grundrechenarten', () => {
    expect(run('12 + 7 =').display).toBe('19');
    expect(run('12 - 20 =').display).toBe('-8');
    expect(run('1 , 19 × 3 =').display).toBe('3.57');
    expect(run('10 ÷ 4 =').display).toBe('2.5');
  });

  it('Kettenrechnung mit Sofortausführung', () => {
    const s = run('2 + 3 ×');
    expect(s.display).toBe('5');
    expect(run('4 =', s).display).toBe('20');
  });

  it('keine Gleitkomma-Artefakte', () => {
    expect(run('0 , 1 + 0 , 2 =').display).toBe('0.3');
    expect(run('1 , 1 × 3 =').display).toBe('3.3');
  });

  it('Division durch 0 → Fehler, AC setzt zurück', () => {
    const s = run('5 ÷ 0 =');
    expect(s.error).toBe(true);
    expect(s.display).toBe('Fehler');
    expect(run('AC', s).display).toBe('0');
    expect(run('3', s).display).toBe('3');
  });

  it('Prozent: 50 + 10 % = 55', () => {
    expect(run('50 + 10 % =').display).toBe('55');
    expect(run('80 - 25 % =').display).toBe('60');
    expect(run('200 × 15 % =').display).toBe('30');
    expect(run('7 %').display).toBe('0.07');
  });

  it('Rabatt: 19,99 − 20 % = 15,992', () => {
    expect(run('19 , 99 R 20 =').display).toBe('15.992');
    expect(run('100 R 30 =').display).toBe('70');
  });

  it('Rabatt auf Zwischenergebnis', () => {
    expect(run('40 + 60 R 10 =').display).toBe('90');
  });

  it('Zwischensummen', () => {
    let s = run('3 × 2 ZS');
    s = run('AC 4 , 5 ZS', s);
    expect(s.subtotals).toEqual([6, 4.5]);
    expect(subtotalSum(s)).toBe(10.5);
  });

  it('Operator ersetzen', () => {
    expect(run('9 + - 4 =').display).toBe('5');
  });

  it('Rücktaste und Vorzeichen', () => {
    expect(run('123 ⌫').display).toBe('12');
    expect(run('5 ⌫').display).toBe('0');
    expect(run('5 ±').display).toBe('-5');
  });

  it('nur ein Dezimaltrennzeichen', () => {
    expect(run('1 , 2 , 3').display).toBe('1.23');
  });

  it('Anzeigeformat deutsch', () => {
    expect(formatDisplay('1234567.5')).toBe('1.234.567,5');
    expect(formatDisplay('-0.25')).toBe('-0,25');
  });
});
