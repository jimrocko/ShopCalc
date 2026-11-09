import { useState } from 'react';
import type { SourceReport, SourceStatus } from '../sources/types';
import { cx } from './ui';

const STATUS: Record<SourceStatus, { icon: string; label: string; tone: string }> = {
  ok: { icon: '✓', label: 'gefunden', tone: 'text-accent' },
  empty: { icon: '–', label: 'nichts gefunden', tone: 'text-muted' },
  skipped: { icon: '–', label: 'nicht zuständig', tone: 'text-muted' },
  offline: { icon: '!', label: 'offline', tone: 'text-warn' },
  error: { icon: '!', label: 'Fehler', tone: 'text-danger' },
  disabled: { icon: '○', label: 'deaktiviert', tone: 'text-muted' },
  unavailable: { icon: '×', label: 'nicht verfügbar', tone: 'text-muted' },
};

/** Transparente Übersicht, welche Datenquelle was geliefert hat. */
export function SourceList({ reports }: { reports: SourceReport[] }) {
  const [open, setOpen] = useState(false);
  const found = reports.filter((r) => r.status === 'ok').length;
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        className="tap text-[13px] font-semibold text-accent"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Datenquellen ausblenden' : `Datenquellen anzeigen (${found} von ${reports.length} mit Treffern)`}
      </button>
      {open && (
        <ul className="mt-2 divide-y divide-line/60 overflow-hidden rounded-2xl bg-card2 text-[13px]" data-testid="source-list">
          {reports.map((r) => {
            const s = STATUS[r.status];
            return (
              <li key={r.id} className="flex gap-3 px-4 py-2.5">
                <span aria-hidden="true" className={cx('w-4 shrink-0 text-center font-bold', s.tone)}>
                  {s.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-white/90">
                    {r.label} <span className={cx('font-normal', s.tone)}>· {s.label}</span>
                  </span>
                  <span className="block text-muted">{r.detail}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
