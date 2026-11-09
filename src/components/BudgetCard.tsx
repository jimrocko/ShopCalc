import { formatCents } from '../lib/money';
import { useApp } from '../state/AppContext';
import { cx } from './ui';
import { IconPencil } from './icons';

export function BudgetCard({ onEditBudget }: { onEditBudget: () => void }) {
  const { budget } = useApp();
  const pct = budget.budgetCents > 0 ? Math.min(100, Math.max(0, budget.usedRatio * 100)) : budget.totalCents > 0 ? 100 : 0;
  const tone = budget.level === 'over' ? 'text-danger' : budget.level === 'near' ? 'text-warn' : 'text-white';
  const bar = budget.level === 'over' ? 'bg-danger' : budget.level === 'near' ? 'bg-warn' : 'bg-accent';

  return (
    <section
      aria-label="Budgetübersicht"
      className={cx(
        'rounded-[28px] border p-5 transition-colors',
        budget.level === 'over' ? 'border-danger/40 bg-danger/[0.07]' : 'border-line/50 bg-card',
      )}
    >
      <button
        type="button"
        onClick={onEditBudget}
        className="tap -mx-1 flex items-center gap-2 rounded-xl px-1 text-[13px] font-medium uppercase tracking-wide text-muted"
      >
        Budget {formatCents(budget.budgetCents)}
        <IconPencil size={14} />
      </button>

      <div className="mt-3">
        <div className="text-[13px] font-medium text-muted">Noch verfügbar</div>
        <div
          className={cx('font-display text-[52px] font-bold leading-[1.05] tracking-tight tabular-nums', tone)}
          aria-live="polite"
          data-testid="remaining"
        >
          {formatCents(budget.remainingCents)}
        </div>
      </div>

      <div
        className="mt-4 h-2 w-full overflow-hidden rounded-full bg-line/70"
        role="progressbar"
        aria-label="Budget verbraucht"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div className={cx('h-full rounded-full transition-all duration-300', bar)} style={{ width: `${pct}%` }} />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Gesamtbudget" short="Budget" value={formatCents(budget.budgetCents)} />
        <Stat label="Ausgegeben" short="Ausgaben" value={formatCents(budget.totalCents)} />
        <Stat
          label="Verfügbar"
          value={formatCents(budget.remainingCents)}
          className={budget.level === 'over' ? 'text-danger' : budget.level === 'near' ? 'text-warn' : undefined}
        />
      </dl>

      {budget.overBudget && (
        <p role="status" className="mt-4 rounded-2xl bg-danger/15 px-3.5 py-2.5 text-[14px] font-medium text-danger">
          Budget um {formatCents(-budget.remainingCents)} überschritten
        </p>
      )}
      {budget.level === 'near' && (
        <p role="status" className="mt-4 rounded-2xl bg-warn/10 px-3.5 py-2.5 text-[14px] font-medium text-warn">
          Über 90 % des Budgets verbraucht
        </p>
      )}
    </section>
  );
}

function Stat({ label, short, value, className }: { label: string; short?: string; value: string; className?: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-card2/80 px-2.5 py-2.5 min-[380px]:px-3">
      <dt className="truncate text-[11px] font-medium text-muted min-[380px]:text-[11.5px]">
        {short ? (
          <>
            <span className="min-[380px]:hidden">{short}</span>
            <span className="hidden min-[380px]:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </dt>
      <dd className={cx('mt-0.5 truncate text-[14px] font-semibold tabular-nums min-[380px]:text-[15px]', className)}>{value}</dd>
    </div>
  );
}
