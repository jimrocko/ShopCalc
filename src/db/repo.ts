import { getDB } from './db';
import { uid } from '../lib/id';
import {
  DEFAULT_SETTINGS,
  emptySession,
  normalizePrice,
  normalizeProduct,
  type PriceRecord,
  type Product,
  type Session,
  type Settings,
  type Store,
} from '../lib/types';
import { normalizeBarcode } from '../lib/barcode';

/* ---------- Einstellungen ---------- */

export async function loadSettings(): Promise<Settings> {
  const db = await getDB();
  const s = await db.get('settings', 'app');
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await getDB();
  await db.put('settings', settings);
}

/* ---------- Aktuelle Berechnung ---------- */

export async function loadSession(): Promise<Session> {
  const db = await getDB();
  const s = await db.get('session', 'current');
  if (!s) return emptySession();
  return { ...emptySession(s.startedAt), ...s };
}

export async function saveSession(session: Session): Promise<void> {
  const db = await getDB();
  await db.put('session', session);
}

/* ---------- Märkte ---------- */

export async function listStores(): Promise<Store[]> {
  const db = await getDB();
  const all = await db.getAll('stores');
  return all.sort((a, b) => {
    if (a.builtIn !== b.builtIn) return a.builtIn ? -1 : 1;
    return a.builtIn ? a.createdAt - b.createdAt || a.name.localeCompare(b.name) : a.name.localeCompare(b.name, 'de');
  });
}

export async function addStore(name: string): Promise<Store> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name fehlt');
  const db = await getDB();
  const existing = (await db.getAll('stores')).find((s) => s.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;
  const store: Store = { id: uid(), name: trimmed.slice(0, 40), builtIn: false, createdAt: Date.now() };
  await db.put('stores', store);
  return store;
}

export async function renameStore(id: string, name: string): Promise<void> {
  const db = await getDB();
  const s = await db.get('stores', id);
  if (!s || !name.trim()) return;
  await db.put('stores', { ...s, name: name.trim().slice(0, 40) });
}

export async function deleteStore(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('stores', id);
}

/* ---------- Produkte ---------- */

export async function listProducts(): Promise<Product[]> {
  const db = await getDB();
  const all = (await db.getAll('products')).map(normalizeProduct);
  return all.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export async function getProduct(id: string): Promise<Product | undefined> {
  const db = await getDB();
  const p = await db.get('products', id);
  return p ? normalizeProduct(p) : undefined;
}

export async function findProductByBarcode(barcode: string): Promise<Product | undefined> {
  const db = await getDB();
  const p = await db.getFromIndex('products', 'barcode', normalizeBarcode(barcode));
  return p ? normalizeProduct(p) : undefined;
}

/** Sucht ein Produkt ohne Barcode mit gleichem Namen und gleicher Größe. */
export async function findProductByName(name: string, size = ''): Promise<Product | undefined> {
  const n = name.trim().toLowerCase();
  if (!n) return undefined;
  const db = await getDB();
  const all = await db.getAll('products');
  return all.find((p) => p.name.trim().toLowerCase() === n && p.size.trim().toLowerCase() === size.trim().toLowerCase());
}

export type ProductInput = Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>> & { name: string };

/**
 * Legt ein Produkt an oder aktualisiert es (Abgleich über ID, sonst Barcode).
 * Mit `onlyFillEmpty` werden vorhandene Angaben nicht überschrieben (z. B. wenn Online-Daten
 * ein selbst angelegtes Produkt ergänzen).
 */
export async function upsertProduct(
  input: ProductInput & { id?: string },
  { onlyFillEmpty = false }: { onlyFillEmpty?: boolean } = {},
): Promise<Product> {
  const db = await getDB();
  const now = Date.now();
  const barcode = input.barcode ? normalizeBarcode(input.barcode) : null;
  let raw: Product | undefined;
  if (input.id) raw = await db.get('products', input.id);
  if (!raw && barcode) raw = await db.getFromIndex('products', 'barcode', barcode);
  const existing = raw ? normalizeProduct(raw) : undefined;

  const pick = <K extends 'name' | 'brand' | 'category' | 'size'>(k: K): string => {
    const incoming = input[k];
    const current = existing?.[k] ?? '';
    if (incoming === undefined) return current;
    const placeholder = k === 'name' && current === `Produkt ${barcode ?? existing?.barcode ?? ''}`;
    if (onlyFillEmpty && current.trim() && !placeholder) return current;
    return incoming.trim();
  };
  const product: Product = {
    id: existing?.id ?? input.id ?? uid(),
    barcode: barcode ?? existing?.barcode ?? null,
    name: pick('name'),
    brand: pick('brand'),
    category: pick('category'),
    size: pick('size'),
    source: onlyFillEmpty && existing ? existing.source : input.source ?? existing?.source ?? 'user',
    productType: (onlyFillEmpty ? existing?.productType ?? input.productType : input.productType ?? existing?.productType) ?? null,
    imageUrl: (onlyFillEmpty ? existing?.imageUrl || input.imageUrl : input.imageUrl ?? existing?.imageUrl) ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await db.put('products', product);
  return product;
}

/**
 * Erkennt doppelte Produkte anhand der (normalisierten) GTIN/EAN und führt sie zusammen:
 * Das älteste Produkt bleibt erhalten, leere Angaben werden aus den Duplikaten ergänzt,
 * alle Preise werden umgehängt. Gibt die Anzahl entfernter Duplikate zurück.
 */
export async function mergeDuplicateProducts(): Promise<number> {
  const db = await getDB();
  const tx = db.transaction(['products', 'prices'], 'readwrite');
  const products = (await tx.objectStore('products').getAll()).map(normalizeProduct);
  const groups = new Map<string, Product[]>();
  for (const p of products) {
    if (!p.barcode) continue;
    const key = normalizeBarcode(p.barcode);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  let removed = 0;
  for (const [barcode, group] of groups) {
    const raw = await tx.objectStore('products').get(group[0].id);
    const needsNormalize = raw && raw.barcode !== barcode;
    if (group.length < 2 && !needsNormalize) continue;
    const [keep, ...dupes] = [...group].sort((a, b) => a.createdAt - b.createdAt);
    const merged: Product = { ...keep, barcode };
    for (const d of dupes) {
      for (const f of ['name', 'brand', 'category', 'size'] as const) if (!merged[f]) merged[f] = d[f];
      merged.imageUrl = merged.imageUrl ?? d.imageUrl;
      merged.productType = merged.productType ?? d.productType;
      const priceKeys = await tx.objectStore('prices').index('productId').getAll(d.id);
      for (const pr of priceKeys) await tx.objectStore('prices').put({ ...pr, productId: keep.id });
      await tx.objectStore('products').delete(d.id);
      removed++;
    }
    await tx.objectStore('products').put(merged);
  }
  await tx.done;
  return removed;
}

export async function deleteProduct(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['products', 'prices'], 'readwrite');
  await tx.objectStore('products').delete(id);
  const keys = await tx.objectStore('prices').index('productId').getAllKeys(id);
  for (const k of keys) await tx.objectStore('prices').delete(k);
  await tx.done;
}

/* ---------- Preise ---------- */

export async function listPrices(productId: string): Promise<PriceRecord[]> {
  const db = await getDB();
  const all = (await db.getAllFromIndex('prices', 'productId', productId)).map(normalizePrice);
  return all.sort((a, b) => b.recordedAt - a.recordedAt);
}

export async function listAllPrices(): Promise<PriceRecord[]> {
  const db = await getDB();
  return (await db.getAll('prices')).map(normalizePrice);
}

/**
 * Speichert einen vom Nutzer erfassten Preis (Quelle: manuell, Filiale). Ist der neueste eigene Preis
 * desselben Marktes identisch, wird nur dessen Datum aktualisiert (keine Duplikate).
 */
export async function recordPrice(
  productId: string,
  storeId: string | null,
  priceCents: number,
  recordedAt = Date.now(),
  { estimated = false }: { estimated?: boolean } = {},
): Promise<PriceRecord> {
  if (!Number.isSafeInteger(priceCents) || priceCents < 0) throw new Error('Ungültiger Preis');
  const db = await getDB();
  const existing = (await db.getAllFromIndex('prices', 'productId', productId)).map(normalizePrice);
  const latestSameStore = existing
    .filter((p) => p.source === 'manual' && (p.storeId ?? null) === (storeId ?? null))
    .sort((a, b) => b.recordedAt - a.recordedAt)[0];
  if (latestSameStore && latestSameStore.priceCents === priceCents && latestSameStore.estimated === estimated) {
    const updated = { ...latestSameStore, recordedAt: Math.max(recordedAt, latestSameStore.recordedAt) };
    await db.put('prices', updated);
    return updated;
  }
  const rec: PriceRecord = {
    id: uid(),
    productId,
    storeId: storeId ?? null,
    priceCents,
    recordedAt,
    source: 'manual',
    channel: 'store',
    estimated,
  };
  await db.put('prices', rec);
  return rec;
}

/** Externer Preis ohne Produktzuordnung (z. B. aus Open Prices). */
export type ExternalPriceInput = Omit<PriceRecord, 'id' | 'productId' | 'estimated'> & { externalId: string };

/**
 * Speichert Preise aus einer externen Quelle lokal (für Offline-Nutzung).
 * Idempotent: gleiche externe ID überschreibt den bisherigen Eintrag.
 */
export async function saveExternalPrices(productId: string, prices: ExternalPriceInput[]): Promise<number> {
  if (prices.length === 0) return 0;
  const db = await getDB();
  const tx = db.transaction('prices', 'readwrite');
  for (const p of prices) {
    if (!Number.isSafeInteger(p.priceCents) || p.priceCents <= 0) continue;
    await tx.store.put({ ...p, id: `${p.source}-${p.externalId}`, productId, estimated: false });
  }
  await tx.done;
  return prices.length;
}

export async function deletePrice(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('prices', id);
}

/* ---------- Sicherung ---------- */

export interface BackupFile {
  app: 'shopcalc';
  version: 1 | 2;
  exportedAt: number;
  products: Product[];
  prices: PriceRecord[];
  stores: Store[];
  settings: Settings;
}

export async function exportAll(): Promise<BackupFile> {
  const db = await getDB();
  return {
    app: 'shopcalc',
    version: 2,
    exportedAt: Date.now(),
    products: await db.getAll('products'),
    prices: await db.getAll('prices'),
    stores: await db.getAll('stores'),
    settings: await loadSettings(),
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Importiert eine Sicherung (zusammenführend: vorhandene Einträge mit gleicher ID werden überschrieben). */
export async function importAll(data: unknown): Promise<{ products: number; prices: number; stores: number }> {
  if (!isObj(data) || data.app !== 'shopcalc' || !Array.isArray(data.products) || !Array.isArray(data.prices)) {
    throw new Error('Keine gültige ShopCalc-Sicherung');
  }
  const products = (data.products as unknown[]).filter(
    (p): p is Partial<Product> & Pick<Product, 'id' | 'name'> => isObj(p) && typeof p.id === 'string' && typeof p.name === 'string',
  );
  const prices = (data.prices as unknown[]).filter(
    (p): p is Partial<PriceRecord> & Pick<PriceRecord, 'id' | 'productId' | 'priceCents' | 'recordedAt'> =>
      isObj(p) &&
      typeof p.id === 'string' &&
      typeof p.productId === 'string' &&
      Number.isSafeInteger(p.priceCents) &&
      typeof p.recordedAt === 'number',
  );
  const stores = (Array.isArray(data.stores) ? (data.stores as unknown[]) : []).filter(
    (s): s is Partial<Store> & Pick<Store, 'id' | 'name'> => isObj(s) && typeof s.id === 'string' && typeof s.name === 'string',
  );
  const db = await getDB();
  const tx = db.transaction(['products', 'prices', 'stores'], 'readwrite');
  for (const p of products) await tx.objectStore('products').put(normalizeProduct(p));
  for (const p of prices) await tx.objectStore('prices').put(normalizePrice(p));
  for (const s of stores) await tx.objectStore('stores').put({ ...s, builtIn: s.builtIn ?? false, createdAt: s.createdAt ?? Date.now() });
  await tx.done;
  await mergeDuplicateProducts();
  return { products: products.length, prices: prices.length, stores: stores.length };
}

export async function clearProductDatabase(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['products', 'prices'], 'readwrite');
  await tx.objectStore('products').clear();
  await tx.objectStore('prices').clear();
  await tx.done;
}
