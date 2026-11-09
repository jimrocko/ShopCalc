import { multiply, type Cents } from './money';
import type { CartItem, DepositEntry, Session } from './types';
import { uid } from './id';

export interface Totals {
  /** Reiner Warenwert ohne Pfand */
  goodsCents: Cents;
  /** Pfand aus Positionen + separaten Pfand-Einträgen */
  depositCents: Cents;
  /** Verrechnetes zurückgegebenes Pfand (positiver Wert) */
  depositReturnedCents: Cents;
  /** Gesamtsumme = Ware + Pfand − Pfandrückgabe */
  totalCents: Cents;
  /** Anzahl Artikel (Summe der Mengen) */
  itemCount: number;
}

export interface BudgetStatus extends Totals {
  budgetCents: Cents;
  /** Darf negativ sein */
  remainingCents: Cents;
  overBudget: boolean;
  /** Anteil des Budgets, der verbraucht ist (0..∞) */
  usedRatio: number;
  level: 'ok' | 'near' | 'over';
}

export function itemGoodsTotal(item: CartItem): Cents {
  return multiply(item.unitPriceCents, item.quantity);
}

export function itemDepositTotal(item: CartItem): Cents {
  return multiply(item.depositCents, item.quantity);
}

export function itemTotal(item: CartItem): Cents {
  return itemGoodsTotal(item) + itemDepositTotal(item);
}

export function depositEntryTotal(entry: DepositEntry): Cents {
  return multiply(entry.amountCents, entry.count);
}

export function computeTotals(session: Pick<Session, 'items' | 'deposits'>): Totals {
  let goods = 0;
  let deposit = 0;
  let returned = 0;
  let count = 0;
  for (const item of session.items) {
    goods += itemGoodsTotal(item);
    deposit += itemDepositTotal(item);
    count += item.quantity;
  }
  for (const entry of session.deposits) {
    if (entry.kind === 'charge') deposit += depositEntryTotal(entry);
    else returned += depositEntryTotal(entry);
  }
  return {
    goodsCents: goods,
    depositCents: deposit,
    depositReturnedCents: returned,
    totalCents: goods + deposit - returned,
    itemCount: count,
  };
}

/** Ab diesem Anteil des Budgets wird eine Vorwarnung angezeigt. */
export const NEAR_BUDGET_RATIO = 0.9;

export function computeBudget(session: Pick<Session, 'items' | 'deposits'>, budgetCents: Cents): BudgetStatus {
  const totals = computeTotals(session);
  const remaining = budgetCents - totals.totalCents;
  const usedRatio = budgetCents > 0 ? totals.totalCents / budgetCents : totals.totalCents > 0 ? Infinity : 0;
  const overBudget = remaining < 0;
  return {
    ...totals,
    budgetCents,
    remainingCents: remaining,
    overBudget,
    usedRatio,
    level: overBudget ? 'over' : usedRatio >= NEAR_BUDGET_RATIO && budgetCents > 0 ? 'near' : 'ok',
  };
}

export type NewItem = Omit<CartItem, 'id' | 'addedAt'>;

/** Zwei Positionen gelten als gleich, wenn Produkt, Name, Preis, Pfand und Markt übereinstimmen. */
export function isSameItem(a: NewItem | CartItem, b: NewItem | CartItem): boolean {
  if (a.unitPriceCents !== b.unitPriceCents) return false;
  if (a.depositCents !== b.depositCents) return false;
  if ((a.storeId ?? null) !== (b.storeId ?? null)) return false;
  if (a.productId && b.productId) return a.productId === b.productId;
  if (a.barcode && b.barcode) return a.barcode === b.barcode;
  const an = a.name.trim().toLowerCase();
  const bn = b.name.trim().toLowerCase();
  // Namenlose Positionen werden nicht automatisch zusammengefasst
  if (!an || !bn) return false;
  return an === bn;
}

export function sanitizeQuantity(q: number): number {
  if (!Number.isFinite(q)) return 1;
  return Math.max(1, Math.min(9999, Math.round(q)));
}

/**
 * Fügt eine Position hinzu. Bei `merge` wird eine gleiche, bereits vorhandene Position
 * stattdessen in der Menge erhöht. Gibt die neue Liste und die ID der betroffenen Position zurück.
 */
export function addItem(
  items: CartItem[],
  input: NewItem,
  { merge, now = Date.now(), id = uid() }: { merge: boolean; now?: number; id?: string },
): { items: CartItem[]; itemId: string; merged: boolean } {
  const quantity = sanitizeQuantity(input.quantity);
  if (merge) {
    const existing = items.find((it) => isSameItem(it, input));
    if (existing) {
      return {
        items: items.map((it) =>
          it.id === existing.id ? { ...it, quantity: sanitizeQuantity(it.quantity + quantity) } : it,
        ),
        itemId: existing.id,
        merged: true,
      };
    }
  }
  const item: CartItem = { ...input, quantity, id, addedAt: now };
  return { items: [item, ...items], itemId: id, merged: false };
}

/** Fasst alle gleichen Positionen einer Liste zusammen. */
export function mergeAll(items: CartItem[]): CartItem[] {
  const result: CartItem[] = [];
  for (const item of [...items].reverse()) {
    const existing = result.find((r) => isSameItem(r, item));
    if (existing) existing.quantity = sanitizeQuantity(existing.quantity + item.quantity);
    else result.push({ ...item });
  }
  return result.reverse();
}
