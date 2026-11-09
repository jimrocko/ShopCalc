import { useEffect, useState } from 'react';
import { Button, Chip, Label, MoneyInput, Segmented, Sheet, Stepper, inputClass } from './ui';
import { useApp } from '../state/AppContext';
import { formatCents, multiply } from '../lib/money';
import type { DepositEntry, DepositKind } from '../lib/types';
import { depositEntryTotal } from '../lib/cart';
import { IconTrash } from './icons';

const PRESETS: Array<{ label: string; cents: number }> = [
  { label: 'Einweg 0,25 €', cents: 25 },
  { label: 'Mehrweg 0,08 €', cents: 8 },
  { label: 'Mehrweg 0,15 €', cents: 15 },
  { label: 'Kasten 1,50 €', cents: 150 },
  { label: 'Kasten 3,10 €', cents: 310 },
];

export function DepositSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch, budget, showToast } = useApp();
  const [kind, setKind] = useState<DepositKind>('charge');
  const [amount, setAmount] = useState<number | null>(state.settings.defaultDepositCents);
  const [count, setCount] = useState(1);
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (open) {
      setAmount(state.settings.defaultDepositCents);
      setCount(1);
      setLabel('');
    }
  }, [open, state.settings.defaultDepositCents]);

  const total = amount !== null ? multiply(amount, count) : 0;

  const add = () => {
    if (amount === null || amount <= 0) return;
    dispatch({
      type: 'addDeposit',
      entry: { kind, amountCents: amount, count, label: label.trim() || (kind === 'charge' ? 'Pfand' : 'Pfandrückgabe') },
    });
    showToast(kind === 'charge' ? `Pfand ${formatCents(total)} hinzugefügt` : `Pfandrückgabe ${formatCents(total)} verrechnet`);
    setCount(1);
    setLabel('');
  };

  const remove = (d: DepositEntry) => dispatch({ type: 'removeDeposit', id: d.id });

  return (
    <Sheet open={open} onClose={onClose} title="Pfand">
      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-card2 p-3 text-center">
        <div>
          <div className="text-[11.5px] text-muted">Pfand gesamt</div>
          <div className="text-[16px] font-semibold tabular-nums">{formatCents(budget.depositCents)}</div>
        </div>
        <div>
          <div className="text-[11.5px] text-muted">Rückgabe</div>
          <div className="text-[16px] font-semibold tabular-nums text-accent">−{formatCents(budget.depositReturnedCents)}</div>
        </div>
        <div>
          <div className="text-[11.5px] text-muted">Saldo</div>
          <div className="text-[16px] font-semibold tabular-nums">
            {formatCents(budget.depositCents - budget.depositReturnedCents)}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <Segmented
          label="Art"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'charge', label: 'Pfand hinzufügen' },
            { value: 'return', label: 'Rückgabe verrechnen' },
          ]}
        />
      </div>

      <div className="mt-5">
        <Label>Betrag je Stück</Label>
        <div className="no-scrollbar -mx-5 mb-2 flex gap-2 overflow-x-auto px-5">
          {PRESETS.map((p) => (
            <Chip key={p.cents} active={amount === p.cents} onClick={() => setAmount(p.cents)}>
              {p.label}
            </Chip>
          ))}
        </div>
        <MoneyInput valueCents={amount} onChange={setAmount} />
        {kind === 'return' && (
          <p className="mt-1.5 text-[12px] text-muted">Tipp: Für einen Leergutbon Anzahl 1 und den Bon-Betrag eingeben.</p>
        )}
      </div>

      <div className="mt-5">
        <Label>Anzahl</Label>
        <Stepper value={count} onChange={setCount} label="Anzahl" />
      </div>

      <div className="mt-5">
        <Label hint="optional">Bezeichnung</Label>
        <input
          className={inputClass}
          placeholder={kind === 'charge' ? 'z. B. Wasserkasten' : 'z. B. Leergutbon'}
          value={label}
          maxLength={60}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>

      <Button variant="primary" size="lg" className="mt-5 w-full" disabled={!amount} onClick={add}>
        {kind === 'charge' ? `+ ${formatCents(total)} Pfand` : `− ${formatCents(total)} verrechnen`}
      </Button>

      {state.session.deposits.length > 0 && (
        <div className="mt-6">
          <Label>Erfasste Pfand-Einträge</Label>
          <ul className="divide-y divide-line/60 overflow-hidden rounded-2xl bg-card2">
            {state.session.deposits.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px]">{d.label}</div>
                  <div className="text-[12px] text-muted tabular-nums">
                    {d.count} × {formatCents(d.amountCents)}
                  </div>
                </div>
                <div className={'text-[16px] font-semibold tabular-nums ' + (d.kind === 'return' ? 'text-accent' : '')}>
                  {d.kind === 'return' ? '−' : '+'}
                  {formatCents(depositEntryTotal(d))}
                </div>
                <button type="button" aria-label="Eintrag entfernen" className="tap p-1 text-muted" onClick={() => remove(d)}>
                  <IconTrash size={18} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}
