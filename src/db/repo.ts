import { getDB } from './db';
import { uid } from '../lib/id';
import {
  DEFAULT_SETTINGS,
  emptySession,
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
  const all = await db.getAll('products');
  return all.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export async function getProduct(id: string): Promise<Product | undefined> {
  const db = await getDB();
  return db.get('products', id);
}

export async function findProductByBarcode(barcode: string): Promise<Product | undefined> {
  const db = await getDB();
  return db.getFromIndex('products', 'barcode', normalizeBarcode(barcode));
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

export async function upsertProduct(input: ProductInput & { id?: string }): Promise<Product> {
  const db = await getDB();
  const now = Date.now();
  const barcode = input.barcode ? normalizeBarcode(input.barcode) : null;
  let existing: Product | undefined;
  if (input.id) existing = await db.get('products', input.id);
  if (!existing && barcode) existing = await db.getFromIndex('products', 'barcode', barcode);
  const product: Product = {
    id: existing?.id ?? input.id ?? uid(),
    barcode: barcode ?? existing?.barcode ?? null,
    name: (input.name ?? existing?.name ?? '').trim(),
    brand: (input.brand ?? existing?.brand ?? '').trim(),
    category: (input.category ?? existing?.category ?? '').trim(),
    size: (input.size ?? existing?.size ?? '').trim(),
    source: input.source ?? existing?.source ?? 'user',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await db.put('products', product);
  return product;
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
  const all = await db.getAllFromIndex('prices', 'productId', productId);
  return all.sort((a, b) => b.recordedAt - a.recordedAt);
}

export async function listAllPrices(): Promise<PriceRecord[]> {
  const db = await getDB();
  return db.getAll('prices');
}

/**
 * Speichert einen vom Nutzer erfassten Preis. Ist der neueste Preis desselben Marktes identisch,
 * wird nur dessen Datum aktualisiert (keine Duplikate).
 */
export async function recordPrice(
  productId: string,
  storeId: string | null,
  priceCents: number,
  recordedAt = Date.now(),
): Promise<PriceRecord> {
  if (!Number.isSafeInteger(priceCents) || priceCents < 0) throw new Error('Ungültiger Preis');
  const db = await getDB();
  const existing = await db.getAllFromIndex('prices', 'productId', productId);
  const latestSameStore = existing
    .filter((p) => (p.storeId ?? null) === (storeId ?? null))
    .sort((a, b) => b.recordedAt - a.recordedAt)[0];
  if (latestSameStore && latestSameStore.priceCents === priceCents) {
    const updated = { ...latestSameStore, recordedAt: Math.max(recordedAt, latestSameStore.recordedAt) };
    await db.put('prices', updated);
    return updated;
  }
  const rec: PriceRecord = { id: uid(), productId, storeId: storeId ?? null, priceCents, recordedAt };
  await db.put('prices', rec);
  return rec;
}

export async function deletePrice(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('prices', id);
}

/* ---------- Sicherung ---------- */

export interface BackupFile {
  app: 'shopcalc';
  version: 1;
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
    version: 1,
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
    (p): p is PriceRecord =>
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
  for (const p of products)
    await tx.objectStore('products').put({
      ...p,
      brand: p.brand ?? '',
      category: p.category ?? '',
      size: p.size ?? '',
      barcode: p.barcode ?? null,
      source: p.source ?? 'user',
      createdAt: p.createdAt ?? Date.now(),
      updatedAt: p.updatedAt ?? Date.now(),
    });
  for (const p of prices) await tx.objectStore('prices').put({ ...p, storeId: p.storeId ?? null });
  for (const s of stores) await tx.objectStore('stores').put({ ...s, builtIn: s.builtIn ?? false, createdAt: s.createdAt ?? Date.now() });
  await tx.done;
  return { products: products.length, prices: prices.length, stores: stores.length };
}

export async function clearProductDatabase(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['products', 'prices'], 'readwrite');
  await tx.objectStore('products').clear();
  await tx.objectStore('prices').clear();
  await tx.done;
}
