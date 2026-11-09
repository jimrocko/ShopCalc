/**
 * Reiner, testbarer Taschenrechner-Zustandsautomat (Sofortausführung wie beim iPhone-Rechner).
 * Zahlen werden nach jeder Operation auf 12 signifikante Stellen normalisiert,
 * damit Gleitkomma-Artefakte (0,1 + 0,2) nicht sichtbar werden.
 */
export type Op = '+' | '-' | '×' | '÷';

export interface CalcState {
  /** Aktuelle Anzeige als Zeichenkette mit Punkt als Dezimaltrenner */
  display: string;
  accumulator: number | null;
  pendingOp: Op | null;
  /** true, wenn die nächste Ziffer eine neue Zahl beginnt */
  fresh: boolean;
  /** Rabatt-Modus: nächste Eingabe ist ein Prozentsatz, der von `discountBase` abgezogen wird */
  discountBase: number | null;
  /** Zwischensummen-Speicher */
  subtotals: number[];
  /** Rechenprotokoll */
  tape: string[];
  error: boolean;
}

export type CalcAction =
  | { type: 'digit'; digit: string }
  | { type: 'decimal' }
  | { type: 'op'; op: Op }
  | { type: 'equals' }
  | { type: 'percent' }
  | { type: 'discount' }
  | { type: 'toggleSign' }
  | { type: 'backspace' }
  | { type: 'clear' }
  | { type: 'allClear' }
  | { type: 'subtotal' }
  | { type: 'clearSubtotals' }
  | { type: 'set'; value: number };

export const initialCalcState: CalcState = {
  display: '0',
  accumulator: null,
  pendingOp: null,
  fresh: true,
  discountBase: null,
  subtotals: [],
  tape: [],
  error: false,
};

const MAX_DIGITS = 12;

export function normalize(n: number): number {
  if (!Number.isFinite(n)) return n;
  return Number.parseFloat(n.toPrecision(12));
}

function toDisplay(n: number): string {
  if (!Number.isFinite(n)) return 'Fehler';
  const v = normalize(n);
  if (Object.is(v, -0)) return '0';
  const s = String(v);
  if (s.includes('e')) return v.toExponential(6);
  return s;
}

export function displayValue(state: CalcState): number {
  return Number.parseFloat(state.display) || 0;
}

export function apply(a: number, op: Op, b: number): number {
  switch (op) {
    case '+':
      return normalize(a + b);
    case '-':
      return normalize(a - b);
    case '×':
      return normalize(a * b);
    case '÷':
      return b === 0 ? NaN : normalize(a / b);
  }
}

function fmt(n: number): string {
  return toDisplay(n).replace('.', ',');
}

export function calcReducer(state: CalcState, action: CalcAction): CalcState {
  if (state.error && action.type !== 'allClear' && action.type !== 'clear' && action.type !== 'digit') {
    return state;
  }
  if (state.error) state = { ...initialCalcState, subtotals: state.subtotals, tape: state.tape };

  switch (action.type) {
    case 'digit': {
      if (!/^\d$/.test(action.digit)) return state;
      if (state.fresh) return { ...state, display: action.digit, fresh: false };
      const digitCount = state.display.replace(/[-.]/g, '').length;
      if (digitCount >= MAX_DIGITS) return state;
      const display = state.display === '0' ? action.digit : state.display === '-0' ? `-${action.digit}` : state.display + action.digit;
      return { ...state, display };
    }
    case 'decimal': {
      if (state.fresh) return { ...state, display: '0.', fresh: false };
      if (state.display.includes('.')) return state;
      return { ...state, display: `${state.display}.` };
    }
    case 'toggleSign': {
      if (state.display === '0') return state;
      const display = state.display.startsWith('-') ? state.display.slice(1) : `-${state.display}`;
      return { ...state, display };
    }
    case 'backspace': {
      if (state.fresh) return state;
      let display = state.display.slice(0, -1);
      if (display === '' || display === '-') display = '0';
      return { ...state, display };
    }
    case 'clear':
      return { ...state, display: '0', fresh: true, error: false };
    case 'allClear':
      return { ...initialCalcState, subtotals: state.subtotals, tape: [] };
    case 'set':
      return { ...state, display: toDisplay(action.value), fresh: true };
    case 'op': {
      const current = displayValue(state);
      if (state.discountBase !== null) {
        // Rabatt erst abschließen
        const done = calcReducer(state, { type: 'equals' });
        return calcReducer(done, action);
      }
      if (state.pendingOp && state.accumulator !== null && !state.fresh) {
        const result = apply(state.accumulator, state.pendingOp, current);
        if (!Number.isFinite(result)) return { ...state, display: 'Fehler', error: true };
        return {
          ...state,
          accumulator: result,
          display: toDisplay(result),
          pendingOp: action.op,
          fresh: true,
          tape: [...state.tape, `${fmt(current)} ${action.op}`],
        };
      }
      if (state.pendingOp && state.fresh) {
        // Operator nur austauschen
        const tape = [...state.tape];
        if (tape.length) tape[tape.length - 1] = tape[tape.length - 1].replace(/[+\-×÷]$/, action.op);
        return { ...state, pendingOp: action.op, tape };
      }
      return {
        ...state,
        accumulator: current,
        pendingOp: action.op,
        fresh: true,
        tape: [...state.tape, `${fmt(current)} ${action.op}`],
      };
    }
    case 'equals': {
      const current = displayValue(state);
      if (state.discountBase !== null) {
        const result = normalize(state.discountBase * (1 - current / 100));
        return {
          ...state,
          display: toDisplay(result),
          discountBase: null,
          fresh: true,
          tape: [...state.tape, `− ${fmt(current)} % Rabatt = ${fmt(result)}`],
        };
      }
      if (state.pendingOp === null || state.accumulator === null) {
        return { ...state, fresh: true };
      }
      const result = apply(state.accumulator, state.pendingOp, current);
      if (!Number.isFinite(result)) return { ...state, display: 'Fehler', error: true, pendingOp: null, accumulator: null };
      return {
        ...state,
        display: toDisplay(result),
        accumulator: null,
        pendingOp: null,
        fresh: true,
        tape: [...state.tape, `${fmt(current)} = ${fmt(result)}`],
      };
    }
    case 'percent': {
      const current = displayValue(state);
      let value: number;
      if (state.accumulator !== null && (state.pendingOp === '+' || state.pendingOp === '-')) {
        // 50 + 10 % => 50 + 5
        value = normalize((state.accumulator * current) / 100);
      } else {
        value = normalize(current / 100);
      }
      return { ...state, display: toDisplay(value), fresh: true };
    }
    case 'discount': {
      // Basis = aktuelles Ergebnis; nächste Eingabe = Rabatt in %
      let base = displayValue(state);
      let next = state;
      if (state.pendingOp && state.accumulator !== null && !state.fresh) {
        next = calcReducer(state, { type: 'equals' });
        base = displayValue(next);
      }
      return { ...next, discountBase: base, pendingOp: null, accumulator: null, fresh: true, display: '0' };
    }
    case 'subtotal': {
      let next = state;
      if (state.pendingOp && state.accumulator !== null) next = calcReducer(state, { type: 'equals' });
      if (next.discountBase !== null) next = calcReducer(next, { type: 'equals' });
      const value = displayValue(next);
      return { ...next, subtotals: [...next.subtotals, value], fresh: true, tape: [...next.tape, `ZS + ${fmt(value)}`] };
    }
    case 'clearSubtotals':
      return { ...state, subtotals: [] };
  }
}

export function subtotalSum(state: CalcState): number {
  return state.subtotals.reduce((a, b) => normalize(a + b), 0);
}

export function formatDisplay(display: string): string {
  if (display === 'Fehler') return display;
  const negative = display.startsWith('-');
  const raw = negative ? display.slice(1) : display;
  const [int, frac] = raw.split('.');
  if (int.includes('e')) return display.replace('.', ',');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped}${frac !== undefined ? `,${frac}` : ''}`;
}
