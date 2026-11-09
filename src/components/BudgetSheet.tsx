import { useEffect, useState } from 'react';
import { Button, Chip, Label, MoneyInput, Sheet } from './ui';
import { useApp } from '../state/AppContext';
import { formatCents } from '../lib/money';

const PRESETS = [2000, 3000, 5000, 7500, 10000, 15000];

export function BudgetSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch, showToast } = useApp();
  const [value, setValue] = useState<number | null>(state.settings.budgetCents);
  useEffect(() => {
    if (open) setValue(state.settings.budgetCents);
  }, [open, state.settings.budgetCents]);

  const save = (cents = value) => {
    if (cents === null) return;
    dispatch({ type: 'settings', patch: { budgetCents: cents } });
    showToast(`Budget: ${formatCents(cents)}`);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Budget festlegen"
      footer={
        <Button variant="primary" size="lg" className="w-full" disabled={value === null} onClick={() => save()}>
          Übernehmen
        </Button>
      }
    >
      <Label htmlFor="budget-input">Betrag</Label>
      <MoneyInput id="budget-input" valueCents={value} onChange={(c) => setValue(c)} large autoFocus onEnter={() => save()} />
      <div className="mt-4 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Chip key={p} active={value === p} onClick={() => save(p)}>
            {formatCents(p).replace(',00', '')}
          </Chip>
        ))}
      </div>
      <p className="mt-4 text-[13px] text-muted">
        Das Budget kann jederzeit geändert werden. Bei Überschreitung wird gewarnt – Eingaben werden nie blockiert.
      </p>
    </Sheet>
  );
}
