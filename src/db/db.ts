import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  DEFAULT_SETTINGS,
  DEFAULT_STORES,
  emptySession,
  type PriceRecord,
  type Product,
  type Session,
  type Settings,
  type Store,
} from '../lib/types';

interface ShopCalcDB extends DBSchema {
  products: {
    key: string;
    value: Product;
    indexes: { barcode: string; name: string };
  };
  prices: {
    key: string;
    value: PriceRecord;
    indexes: { productId: string };
  };
  stores: { key: string; value: Store };
  settings: { key: string; value: Settings };
  session: { key: string; value: Session };
}

export const DB_NAME = 'shopcalc';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ShopCalcDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<ShopCalcDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ShopCalcDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          const products = db.createObjectStore('products', { keyPath: 'id' });
          products.createIndex('barcode', 'barcode', { unique: false });
          products.createIndex('name', 'name', { unique: false });
          const prices = db.createObjectStore('prices', { keyPath: 'id' });
          prices.createIndex('productId', 'productId', { unique: false });
          const stores = db.createObjectStore('stores', { keyPath: 'id' });
          db.createObjectStore('settings', { keyPath: 'id' });
          db.createObjectStore('session', { keyPath: 'id' });
          const now = Date.now();
          DEFAULT_STORES.forEach((s, i) => void stores.put({ ...s, builtIn: true, createdAt: now + i }));
          void tx.objectStore('settings').put(DEFAULT_SETTINGS);
          void tx.objectStore('session').put(emptySession(now));
        }
      },
      blocking() {
        // Neue Version in anderem Tab: Verbindung schließen, damit das Upgrade laufen kann
        dbPromise?.then((d) => d.close());
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

/** Nur für Tests: Verbindung schließen und zurücksetzen. */
export async function resetDBConnection(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}

/** Bittet den Browser, die Daten dauerhaft zu speichern (verhindert automatisches Löschen). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* nicht unterstützt */
  }
  return false;
}
