import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconClose, IconMinus, IconPlus } from './icons';
import { formatCentsPlain, parseMoney } from '../lib/money';

export function cx(...c: Array<string | false | null | undefined>): string {
  return c.filter(Boolean).join(' ');
}

/* ---------- Buttons ---------- */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg' | 'sm';
};

export function Button({ variant = 'secondary', size = 'md', className, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={cx(
        'tap inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl font-semibold transition-colors disabled:opacity-40',
        size === 'lg' && 'h-14 px-5 text-[17px]',
        size === 'md' && 'h-12 px-4 text-[16px]',
        size === 'sm' && 'h-9 px-3 text-[14px] rounded-xl',
        variant === 'primary' && 'bg-accent text-black active:bg-emerald-300',
        variant === 'secondary' && 'bg-card2 text-white active:bg-line',
        variant === 'ghost' && 'bg-transparent text-accent active:bg-card2',
        variant === 'danger' && 'bg-danger/15 text-danger active:bg-danger/25',
        className,
      )}
      {...rest}
    />
  );
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'tap inline-flex h-10 w-10 items-center justify-center rounded-full bg-card2 text-white active:bg-line',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------- Bottom Sheet ---------- */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  full = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  full?: boolean;
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          'relative flex w-full max-w-lg animate-sheet-in flex-col rounded-t-[28px] border border-line/60 bg-card sm:rounded-[28px]',
          full ? 'h-[94dvh] sm:h-[86dvh]' : 'max-h-[92dvh]',
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line sm:hidden" />
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <h2 id={titleId} className="font-display text-[20px] font-bold tracking-tight">
            {title}
          </h2>
          <IconButton label="Schließen" onClick={onClose}>
            <IconClose size={18} />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-line/60 px-5 pb-safe pt-3">{footer}</div>}
        {!footer && <div className="pb-safe" />}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Formularelemente ---------- */

export function Label({ children, htmlFor, hint }: { children: ReactNode; htmlFor?: string; hint?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between">
      <label htmlFor={htmlFor} className="text-[13px] font-medium uppercase tracking-wide text-muted">
        {children}
      </label>
      {hint && <span className="text-[12px] text-muted">{hint}</span>}
    </div>
  );
}

export const inputClass =
  'w-full rounded-2xl border border-line bg-card2 px-4 h-12 text-[17px] text-white placeholder:text-muted/70 outline-none focus:border-accent/70 focus:ring-2 focus:ring-accent/20';

/**
 * Geldeingabe: Text mit Dezimaltastatur, akzeptiert Komma und Punkt.
 * Gibt den Wert in Cent (oder null bei leerer/ungültiger Eingabe) über onChange zurück.
 */
export function MoneyInput({
  id,
  valueCents,
  onChange,
  placeholder = '0,00',
  autoFocus,
  large,
  allowNegative,
  onEnter,
  inputRef,
}: {
  id?: string;
  valueCents: number | null;
  onChange: (cents: number | null, raw: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  large?: boolean;
  allowNegative?: boolean;
  onEnter?: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const [raw, setRaw] = useState(valueCents === null ? '' : formatCentsPlain(valueCents));
  const lastEmitted = useRef<number | null>(valueCents);

  // Externe Änderungen übernehmen (z. B. Formular zurückgesetzt)
  useEffect(() => {
    if (valueCents !== lastEmitted.current) {
      setRaw(valueCents === null ? '' : formatCentsPlain(valueCents));
      lastEmitted.current = valueCents;
    }
  }, [valueCents]);

  const invalid = raw.trim() !== '' && parseMoney(raw, { allowNegative }) === null;

  return (
    <div className="relative">
      <input
        id={id}
        ref={inputRef}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={raw}
        aria-invalid={invalid}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.,\-\s€]/g, '');
          setRaw(v);
          const cents = parseMoney(v, { allowNegative });
          lastEmitted.current = cents;
          onChange(cents, v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onEnter?.();
          }
        }}
        onBlur={() => {
          const cents = parseMoney(raw, { allowNegative });
          if (cents !== null) setRaw(formatCentsPlain(cents));
        }}
        className={cx(
          inputClass,
          'tabular-nums pr-10',
          large && 'h-16 text-[30px] font-semibold tracking-tight',
          invalid && 'border-danger focus:border-danger focus:ring-danger/20',
        )}
      />
      <span
        className={cx(
          'pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted',
          large ? 'text-[22px]' : 'text-[17px]',
        )}
      >
        €
      </span>
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 9999,
  label = 'Menge',
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  label?: string;
}) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => setRaw(String(value)), [value]);
  return (
    <div className="flex h-12 items-center gap-1 rounded-2xl border border-line bg-card2 p-1">
      <button
        type="button"
        aria-label={`${label} verringern`}
        className="tap flex h-10 w-12 items-center justify-center rounded-xl active:bg-line disabled:opacity-30"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <IconMinus size={20} />
      </button>
      <input
        aria-label={label}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={raw}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 4);
          setRaw(v);
          const n = Number.parseInt(v, 10);
          if (Number.isFinite(n) && n >= min) onChange(Math.min(max, n));
        }}
        onBlur={() => setRaw(String(value))}
        className="h-10 w-full min-w-0 bg-transparent text-center text-[18px] font-semibold tabular-nums outline-none"
      />
      <button
        type="button"
        aria-label={`${label} erhöhen`}
        className="tap flex h-10 w-12 items-center justify-center rounded-xl active:bg-line disabled:opacity-30"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <IconPlus size={20} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-2xl bg-card2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'tap h-10 flex-1 rounded-xl text-[15px] font-semibold transition-colors',
            value === o.value ? 'bg-line text-white shadow' : 'text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="tap flex w-full items-center justify-between gap-4 py-3 text-left"
    >
      <span>
        <span className="block text-[16px]">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-muted">{description}</span>}
      </span>
      <span
        className={cx(
          'relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-line',
        )}
      >
        <span
          className={cx(
            'absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-[2px]',
          )}
        />
      </span>
    </button>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-3xl border border-line/50 bg-card', className)}>{children}</div>;
}

export function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'tap h-9 shrink-0 rounded-full border px-3.5 text-[14px] font-medium transition-colors',
        active ? 'border-accent bg-accent/15 text-accent' : 'border-line bg-card2 text-white/90',
      )}
    >
      {children}
    </button>
  );
}

export function Badge({ tone = 'muted', children }: { tone?: 'muted' | 'warn' | 'danger' | 'accent'; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold',
        tone === 'muted' && 'bg-line/70 text-muted',
        tone === 'warn' && 'bg-warn/15 text-warn',
        tone === 'danger' && 'bg-danger/15 text-danger',
        tone === 'accent' && 'bg-accent/15 text-accent',
      )}
    >
      {children}
    </span>
  );
}
