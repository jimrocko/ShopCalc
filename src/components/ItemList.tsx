import { useApp } from '../state/AppContext';
import { formatCents } from '../lib/money';
import { itemGoodsTotal, itemDepositTotal, depositEntryTotal } from '../lib/cart';
import type { CartItem } from '../lib/types';
import { IconBottle, IconMinus, IconPlus, IconCart } from './icons';

export function ItemList({ onEdit, onOpenDeposit }: { onEdit: (item: CartItem) => void; onOpenDeposit: () => void }) {
  const { state, dispatch, storeName, budget } = useApp();
  const { items, deposits } = state.session;

  if (items.length === 0 && deposits.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-10 text-center">
        <IconCart size={32} className="text-muted" />
        <p className="mt-3 text-[15px] text-white/90">Noch nichts erfasst</p>
        <p className="mt-1 text-[13px] text-muted">Gib einen Preis ein oder scanne einen Barcode.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="overflow-hidden rounded-3xl border border-line/50 bg-card">
        {items.map((item, idx) => (
          <li key={item.id} className={'animate-pop ' + (idx > 0 ? 'border-t border-line/50' : '')}>
            <div className="flex items-center gap-2 py-2 pl-4 pr-2">
              <button type="button" className="tap min-w-0 flex-1 py-1 text-left" onClick={() => onEdit(item)}>
                <div className="truncate text-[16px] font-medium">{item.name || <span className="text-muted">Artikel</span>}</div>
                <div className="mt-0.5 truncate text-[12.5px] text-muted tabular-nums">
                  {item.quantity} × {formatCents(item.unitPriceCents)}
                  {item.depositCents > 0 && ` + ${formatCents(itemDepositTotal(item))} Pfand`}
                  {item.storeId && ` · ${storeName(item.storeId)}`}
                </div>
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`Menge von ${item.name || 'Artikel'} verringern`}
                  className="tap flex h-9 w-9 items-center justify-center rounded-full bg-card2 active:bg-line"
                  onClick={() => dispatch({ type: 'changeQty', id: item.id, delta: -1 })}
                >
                  <IconMinus size={16} />
                </button>
                <span className="w-7 text-center text-[15px] font-semibold tabular-nums">{item.quantity}</span>
                <button
                  type="button"
                  aria-label={`Menge von ${item.name || 'Artikel'} erhöhen`}
                  className="tap flex h-9 w-9 items-center justify-center rounded-full bg-card2 active:bg-line"
                  onClick={() => dispatch({ type: 'changeQty', id: item.id, delta: 1 })}
                >
                  <IconPlus size={16} />
                </button>
              </div>
              <div className="w-[84px] text-right text-[16px] font-semibold tabular-nums">
                {formatCents(itemGoodsTotal(item) + itemDepositTotal(item))}
              </div>
            </div>
          </li>
        ))}
        {deposits.map((d, idx) => (
          <li key={d.id} className={items.length + idx > 0 ? 'border-t border-line/50' : ''}>
            <button type="button" className="tap flex w-full items-center gap-3 px-4 py-3 text-left" onClick={onOpenDeposit}>
              <IconBottle size={20} className="text-muted" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px]">{d.label}</div>
                <div className="text-[12.5px] text-muted tabular-nums">
                  {d.count} × {formatCents(d.amountCents)}
                </div>
              </div>
              <div className={'text-[16px] font-semibold tabular-nums ' + (d.kind === 'return' ? 'text-accent' : '')}>
                {d.kind === 'return' ? '−' : ''}
                {formatCents(depositEntryTotal(d))}
              </div>
            </button>
          </li>
        ))}
      </ul>

      <dl className="rounded-3xl border border-line/50 bg-card px-4 py-3 text-[15px]">
        <Row label={`Warenwert (${budget.itemCount} ${budget.itemCount === 1 ? 'Artikel' : 'Artikel'})`} value={formatCents(budget.goodsCents)} />
        <Row label="Pfand" value={formatCents(budget.depositCents)} />
        {budget.depositReturnedCents > 0 && (
          <Row label="Pfandrückgabe" value={`−${formatCents(budget.depositReturnedCents)}`} accent />
        )}
        <div className="my-2 border-t border-line/60" />
        <Row label="Gesamtsumme" value={formatCents(budget.totalCents)} strong />
      </dl>
    </div>
  );
}

function Row({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <dt className={strong ? 'font-semibold' : 'text-muted'}>{label}</dt>
      <dd className={(strong ? 'text-[19px] font-bold ' : '') + (accent ? 'text-accent ' : '') + 'tabular-nums'}>{value}</dd>
    </div>
  );
}
