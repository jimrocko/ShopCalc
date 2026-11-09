import { useEffect, useReducer, useState } from 'react';
import { Button, Sheet, cx } from './ui';
import {
  calcReducer,
  displayValue,
  formatDisplay,
  initialCalcState,
  subtotalSum,
  type CalcAction,
  type CalcState,
} from '../lib/calculator';
import { eurosToCents, formatCents } from '../lib/money';
import { useApp } from '../state/AppContext';
import { IconBackspace } from './icons';

const STORAGE_KEY = 'shopcalc.calculator';

function loadCalc(): CalcState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return { ...initialCalcState, ...(JSON.parse(raw) as Partial<CalcState>) };
  } catch {
    /* ignorieren */
  }
  return initialCalcState;
}

export function CalculatorSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dispatch: appDispatch, showToast } = useApp();
  const [state, dispatch] = useReducer(calcReducer, undefined, loadCalc);
  const [showTape, setShowTape] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignorieren */
    }
  }, [state]);

  // Tastaturbedienung (Desktop)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, CalcAction> = {
        '+': { type: 'op', op: '+' },
        '-': { type: 'op', op: '-' },
        '*': { type: 'op', op: '×' },
        '/': { type: 'op', op: '÷' },
        Enter: { type: 'equals' },
        '=': { type: 'equals' },
        '%': { type: 'percent' },
        ',': { type: 'decimal' },
        '.': { type: 'decimal' },
        Backspace: { type: 'backspace' },
        Delete: { type: 'allClear' },
      };
      if (/^\d$/.test(e.key)) dispatch({ type: 'digit', digit: e.key });
      else if (map[e.key]) {
        e.preventDefault();
        dispatch(map[e.key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const value = displayValue(state);
  const cents = state.error ? null : eurosToCents(value);
  const zs = subtotalSum(state);

  const transfer = (amount: number | null, label: string) => {
    if (amount === null || amount === 0) return;
    if (amount < 0) {
      showToast('Negative Beträge können nicht übernommen werden');
      return;
    }
    appDispatch({
      type: 'addItem',
      item: { name: label, unitPriceCents: amount, quantity: 1, depositCents: 0, storeId: null, productId: null, barcode: null },
    });
    showToast(`${formatCents(amount)} zum Einkauf hinzugefügt`);
    onClose();
  };

  const k = (label: React.ReactNode, action: CalcAction, variant: 'num' | 'op' | 'fn' = 'num', extra?: string, aria?: string) => {
    const active = action.type === 'op' && state.pendingOp === action.op && state.fresh;
    return (
      <button
        type="button"
        aria-label={aria}
        onClick={() => dispatch(action)}
        className={cx(
          'tap flex h-[clamp(44px,7.4dvh,62px)] items-center justify-center rounded-2xl text-[24px] font-medium transition-colors',
          variant === 'num' && 'bg-card2 active:bg-line',
          variant === 'op' && (active ? 'bg-white text-accent' : 'bg-accent text-black active:bg-emerald-300'),
          variant === 'fn' && 'bg-line text-white active:bg-[#3a3a46] text-[20px]',
          extra,
        )}
      >
        {label}
      </button>
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Taschenrechner">
      <div className="rounded-3xl bg-black/40 px-4 pb-3 pt-2">
        <div className="flex min-h-[20px] items-center justify-between text-[13px] text-muted">
          <button type="button" className="tap underline-offset-2 active:underline" onClick={() => setShowTape((s) => !s)}>
            {showTape ? 'Protokoll ausblenden' : `Protokoll (${state.tape.length})`}
          </button>
          <span>
            {state.discountBase !== null
              ? `Rabatt auf ${formatDisplay(String(state.discountBase))} – Prozent eingeben`
              : state.pendingOp && state.accumulator !== null
                ? `${formatDisplay(String(state.accumulator))} ${state.pendingOp}`
                : ''}
          </span>
        </div>
        {showTape && (
          <ul className="mt-2 max-h-28 overflow-y-auto text-right text-[14px] tabular-nums text-muted">
            {state.tape.length === 0 && <li>Noch keine Berechnungen</li>}
            {state.tape.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        )}
        <div
          className="mt-1 truncate text-right font-display text-[clamp(36px,6.5dvh,52px)] font-light tabular-nums leading-tight"
          aria-live="polite"
          data-testid="calc-display"
        >
          {formatDisplay(state.display)}
          {state.discountBase !== null && <span className="text-[28px] text-muted"> %</span>}
        </div>
      </div>

      {state.subtotals.length > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-card2 px-4 py-2.5 text-[14px]">
          <span className="text-muted">
            Zwischensumme ({state.subtotals.length}): <span className="font-semibold text-white tabular-nums">{formatDisplay(String(zs))}</span>
          </span>
          <span className="flex gap-3">
            <button type="button" className="tap font-semibold text-accent" onClick={() => dispatch({ type: 'set', value: zs })}>
              Anzeigen
            </button>
            <button type="button" className="tap text-muted" onClick={() => dispatch({ type: 'clearSubtotals' })}>
              Löschen
            </button>
          </span>
        </div>
      )}

      <div className="mt-3 grid grid-cols-4 gap-[clamp(6px,1dvh,8px)]">
        {k(state.display === '0' || state.fresh ? 'AC' : 'C', state.display === '0' || state.fresh ? { type: 'allClear' } : { type: 'clear' }, 'fn')}
        {k(<IconBackspace size={24} />, { type: 'backspace' }, 'fn', undefined, 'Löschen')}
        {k('%', { type: 'percent' }, 'fn')}
        {k('÷', { type: 'op', op: '÷' }, 'op')}
        {k('7', { type: 'digit', digit: '7' })}
        {k('8', { type: 'digit', digit: '8' })}
        {k('9', { type: 'digit', digit: '9' })}
        {k('×', { type: 'op', op: '×' }, 'op')}
        {k('4', { type: 'digit', digit: '4' })}
        {k('5', { type: 'digit', digit: '5' })}
        {k('6', { type: 'digit', digit: '6' })}
        {k('−', { type: 'op', op: '-' }, 'op', undefined, 'minus')}
        {k('1', { type: 'digit', digit: '1' })}
        {k('2', { type: 'digit', digit: '2' })}
        {k('3', { type: 'digit', digit: '3' })}
        {k('+', { type: 'op', op: '+' }, 'op')}
        {k('±', { type: 'toggleSign' }, 'fn')}
        {k('0', { type: 'digit', digit: '0' })}
        {k(',', { type: 'decimal' })}
        {k('=', { type: 'equals' }, 'op')}
        {k('Rabatt %', { type: 'discount' }, 'fn', 'col-span-2 text-[17px] font-semibold')}
        {k('ZS +', { type: 'subtotal' }, 'fn', 'col-span-2 text-[17px] font-semibold', 'Zur Zwischensumme addieren')}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <Button
          variant="primary"
          size="lg"
          disabled={cents === null || cents <= 0 || state.discountBase !== null || (state.pendingOp !== null && !state.fresh)}
          onClick={() => transfer(cents, 'Rechner')}
        >
          {cents !== null && cents > 0 ? `${formatCents(cents)} in Einkauf übernehmen` : 'In Einkauf übernehmen'}
        </Button>
        {state.subtotals.length > 0 && (
          <Button onClick={() => transfer(eurosToCents(zs), 'Zwischensumme (Rechner)')}>
            Zwischensumme {formatCents(eurosToCents(zs) ?? 0)} übernehmen
          </Button>
        )}
      </div>
    </Sheet>
  );
}
