import type { Cents } from './money';

export interface CartItem {
  id: string;
  /** optionaler Produktname */
  name: string;
  unitPriceCents: Cents;
  quantity: number;
  /** Pfand je Stück */
  depositCents: Cents;
  storeId: string | null;
  productId: string | null;
  barcode: string | null;
  addedAt: number;
}

export type DepositKind = 'charge' | 'return';

/** Separater Pfand-Eintrag (z. B. Kasten, Leergutbon) */
export interface DepositEntry {
  id: string;
  kind: DepositKind;
  label: string;
  amountCents: Cents;
  count: number;
  addedAt: number;
}

export interface Session {
  id: 'current';
  items: CartItem[];
  deposits: DepositEntry[];
  startedAt: number;
  updatedAt: number;
}

export interface Settings {
  id: 'app';
  budgetCents: Cents;
  currentStoreId: string | null;
  /** Ab wie vielen Tagen ein Preis als möglicherweise veraltet gilt */
  staleAfterDays: number;
  /** Gleiche Produkte automatisch zusammenfassen */
  mergeDuplicates: boolean;
  /** Standard-Pfandbetrag für Schnellauswahl */
  defaultDepositCents: Cents;
  /** Erfasste Preise automatisch in der Produktdatenbank speichern */
  rememberPrices: boolean;
  /** Produktinfos bei Open Food Facts nachschlagen */
  useOpenFoodFacts: boolean;
}

export interface Store {
  id: string;
  name: string;
  builtIn: boolean;
  createdAt: number;
}

export interface Product {
  id: string;
  barcode: string | null;
  name: string;
  brand: string;
  category: string;
  /** Packungsgröße, z. B. "1 l" oder "500 g" */
  size: string;
  /** Herkunft der Stammdaten */
  source: 'user' | 'openfoodfacts';
  createdAt: number;
  updatedAt: number;
}

export interface PriceRecord {
  id: string;
  productId: string;
  storeId: string | null;
  priceCents: Cents;
  recordedAt: number;
}

export const DEFAULT_STORES: Array<Pick<Store, 'id' | 'name'>> = [
  { id: 'aldi', name: 'Aldi' },
  { id: 'lidl', name: 'Lidl' },
  { id: 'rewe', name: 'REWE' },
  { id: 'edeka', name: 'EDEKA' },
  { id: 'kaufland', name: 'Kaufland' },
];

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  budgetCents: 5000,
  currentStoreId: null,
  staleAfterDays: 30,
  mergeDuplicates: true,
  defaultDepositCents: 25,
  rememberPrices: true,
  useOpenFoodFacts: true,
};

export function emptySession(now = Date.now()): Session {
  return { id: 'current', items: [], deposits: [], startedAt: now, updatedAt: now };
}
