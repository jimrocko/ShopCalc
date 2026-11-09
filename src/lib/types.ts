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
  /** Produktinfos bei Open Food/Beauty/Pet Food/Products Facts nachschlagen */
  useOpenFoodFacts: boolean;
  /** Öffentliche Preise bei Open Prices nachschlagen (nur Lebensmittel) */
  useOpenPrices: boolean;
}

export interface Store {
  id: string;
  name: string;
  builtIn: boolean;
  createdAt: number;
}

/** Herkunft der Produkt-Stammdaten */
export type ProductSource = 'user' | 'openfoodfacts' | 'openbeautyfacts' | 'openpetfoodfacts' | 'openproductsfacts';

/** Produktart laut Open-*-Facts (food, beauty, petfood, product) */
export type ProductType = 'food' | 'beauty' | 'petfood' | 'product';

export interface Product {
  id: string;
  barcode: string | null;
  name: string;
  brand: string;
  category: string;
  /** Packungsgröße, z. B. "1 l" oder "500 g" */
  size: string;
  source: ProductSource;
  /** null = unbekannt (z. B. selbst angelegt und nie online nachgeschlagen) */
  productType: ProductType | null;
  imageUrl: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Woher ein Preis stammt */
export type PriceSource = 'manual' | 'openprices';
/** Filial- oder Onlinepreis */
export type PriceChannel = 'store' | 'online';
/** Nachweis bei Open Prices */
export type PriceProof = 'price_tag' | 'receipt' | 'gdpr_request' | 'shop_import' | 'unknown';

export interface PriceRecord {
  id: string;
  productId: string;
  /** Zuordnung zu einem ShopCalc-Markt (falls bekannt) */
  storeId: string | null;
  priceCents: Cents;
  /** Datum der Preiserfassung (nicht des Abrufs) */
  recordedAt: number;
  source: PriceSource;
  channel: PriceChannel;
  /** Vom Nutzer als Schätzung markiert */
  estimated: boolean;
  /** Ort/Shop bei externen Quellen, z. B. "Lidl, Berlin" oder "amazon.de" */
  locationLabel?: string;
  /** ISO-Ländercode des Ortes (externe Quellen) */
  countryCode?: string;
  /** ID in der externen Quelle (verhindert Duplikate) */
  externalId?: string;
  proof?: PriceProof;
  discounted?: boolean;
  /** Zeitpunkt des Abrufs aus der externen Quelle */
  fetchedAt?: number;
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
  useOpenPrices: true,
};

/** Ergänzt fehlende Felder älterer Datensätze (Datenbank-Version 1, Sicherungen). */
export function normalizePrice(r: Partial<PriceRecord> & Pick<PriceRecord, 'id' | 'productId' | 'priceCents' | 'recordedAt'>): PriceRecord {
  return {
    ...r,
    storeId: r.storeId ?? null,
    source: r.source ?? 'manual',
    channel: r.channel ?? 'store',
    estimated: r.estimated ?? false,
  };
}

export function normalizeProduct(p: Partial<Product> & Pick<Product, 'id' | 'name'>): Product {
  const now = Date.now();
  return {
    ...p,
    barcode: p.barcode ?? null,
    brand: p.brand ?? '',
    category: p.category ?? '',
    size: p.size ?? '',
    source: p.source ?? 'user',
    productType: p.productType ?? (p.source === 'openfoodfacts' ? 'food' : null),
    imageUrl: p.imageUrl ?? null,
    createdAt: p.createdAt ?? now,
    updatedAt: p.updatedAt ?? now,
  };
}

export function emptySession(now = Date.now()): Session {
  return { id: 'current', items: [], deposits: [], startedAt: now, updatedAt: now };
}
