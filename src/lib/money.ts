/**
 * Geldbeträge werden in der gesamten App als ganzzahlige Cent-Werte geführt.
 * Erst bei der Anzeige werden sie in Euro formatiert.
 */
export type Cents = number;

const formatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const plainFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Stellt sicher, dass ein Wert eine sichere Ganzzahl ist. */
export function assertCents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Ungültiger Cent-Betrag: ${value}`);
  }
  return value;
}

/** 1234 -> "12,34 €" ; -340 -> "-3,40 €" */
export function formatCents(cents: Cents): string {
  // Intl verwendet ein typografisches Minus; für Klarheit ersetzen wir es durch "-"
  return formatter.format(cents / 100).replace('−', '-');
}

/** 1234 -> "12,34" (ohne Währungszeichen, z. B. für Eingabefelder) */
export function formatCentsPlain(cents: Cents): string {
  return plainFormatter.format(cents / 100).replace(/\./g, '').replace('−', '-');
}

/**
 * Wandelt eine Benutzereingabe in Cent um. Akzeptiert deutsche und englische Schreibweise:
 * "1,19" "1.19" "1" "0,5" "1.234,56" "1,234.56" "€ 2,49" "2,49 €".
 * Gibt `null` zurück, wenn die Eingabe kein gültiger Betrag ist.
 */
export function parseMoney(input: string, { allowNegative = false } = {}): Cents | null {
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/€|eur/gi, '').replace(/\s+/g, '');
  if (s === '') return null;

  let negative = false;
  if (s.startsWith('-') || s.startsWith('−')) {
    negative = true;
    s = s.slice(1);
  }
  if (s === '') return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let intPart: string;
  let fracPart = '';

  if (lastComma >= 0 && lastDot >= 0) {
    // Beide Trennzeichen: das letzte ist das Dezimaltrennzeichen
    const decSep = lastComma > lastDot ? ',' : '.';
    const thouSep = decSep === ',' ? '.' : ',';
    const idx = s.lastIndexOf(decSep);
    intPart = s.slice(0, idx).split(thouSep).join('');
    fracPart = s.slice(idx + 1);
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const parts = s.split(sep);
    if (parts.length > 2) {
      // "1.234.567" -> Tausendertrennzeichen
      if (parts.slice(1).every((p) => p.length === 3)) {
        intPart = parts.join('');
      } else {
        return null;
      }
    } else {
      intPart = parts[0];
      fracPart = parts[1];
    }
  } else {
    intPart = s;
  }

  if (intPart === '') intPart = '0';
  if (!/^\d+$/.test(intPart) || !/^\d*$/.test(fracPart)) return null;
  if (fracPart.length > 2) {
    // Mehr als zwei Nachkommastellen: kaufmännisch runden
    const third = Number(fracPart[2]);
    fracPart = fracPart.slice(0, 2);
    const base = Number(intPart) * 100 + Number(fracPart);
    const rounded = third >= 5 ? base + 1 : base;
    return finish(rounded, negative, allowNegative);
  }
  const cents = Number(intPart) * 100 + Number(fracPart.padEnd(2, '0'));
  return finish(cents, negative, allowNegative);
}

function finish(cents: number, negative: boolean, allowNegative: boolean): Cents | null {
  if (!Number.isSafeInteger(cents)) return null;
  if (negative) {
    if (!allowNegative) return null;
    return cents === 0 ? 0 : -cents;
  }
  return cents;
}

/** Multipliziert einen Cent-Betrag mit einer ganzzahligen Menge. */
export function multiply(cents: Cents, quantity: number): Cents {
  if (!Number.isInteger(quantity)) throw new Error('Menge muss ganzzahlig sein');
  return assertCents(cents * quantity);
}

/** Wandelt eine (z. B. vom Taschenrechner stammende) Euro-Zahl kaufmännisch gerundet in Cent um. */
export function eurosToCents(euros: number): Cents | null {
  if (!Number.isFinite(euros)) return null;
  // Erst in Cent umrechnen, dann Gleitkomma-Artefakte (1.005 * 100 = 100.4999…) auf 6 Stellen glätten
  const raw = Number((Math.abs(euros) * 100).toFixed(6));
  const cents = Math.sign(euros) * Math.round(raw);
  return Number.isSafeInteger(cents) ? cents : null;
}
