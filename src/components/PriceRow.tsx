import { Badge, cx } from './ui';
import { formatCents } from '../lib/money';
import { formatAge, formatDate, type ComparisonRow } from '../lib/prices';
import { IconCheck } from './icons';

/**
 * Darstellung eines Preises mit Betrag, Markt/Ort, Datum, Quelle, Kanal (Filiale/Online)
 * und eindeutiger Einordnung (Aktuell bestätigt, Älterer Preis, Onlinepreis, Manuell erfasst, Geschätzt).
 */
export function PriceRow({
  row,
  selected,
  onSelect,
  action,
}: {
  row: ComparisonRow;
  selected?: boolean;
  onSelect?: () => void;
  action?: React.ReactNode;
}) {
  const { record, description: d } = row;
  const content = (
    <>
      {onSelect && (
        <span
          aria-hidden="true"
          className={cx(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
            selected ? 'border-accent bg-accent text-black' : 'border-line',
          )}
        >
          {selected && <IconCheck size={14} strokeWidth={3} />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block break-words text-[15px] font-medium leading-snug">{row.storeName}</span>
        <span className="mt-0.5 block text-[12px] text-muted">
          Erfasst {formatDate(record.recordedAt)} · {formatAge(record.recordedAt)}
          {record.source !== 'manual' && record.fetchedAt ? ` · abgerufen ${formatAge(record.fetchedAt)}` : ''}
        </span>
        <span className="mt-1.5 flex flex-wrap gap-1">
          <Badge tone={d.tone === 'info' ? 'info' : d.tone}>{d.label}</Badge>
          {d.kind !== 'online' && <Badge>{d.channelLabel}</Badge>}
          {d.kind !== 'manual' && <Badge>{d.sourceLabel}</Badge>}
          {record.discounted && <Badge tone="warn">Aktionspreis</Badge>}
        </span>
      </span>
      <span className="shrink-0 text-right text-[19px] font-semibold tabular-nums">{formatCents(row.priceCents)}</span>
    </>
  );
  if (onSelect) {
    return (
      <button
        type="button"
        role="radio"
        aria-checked={!!selected}
        onClick={onSelect}
        className={cx('tap flex w-full items-center gap-3 px-4 py-3 text-left transition-colors', selected && 'bg-accent/[0.07]')}
      >
        {content}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {content}
      {action}
    </div>
  );
}
