/**
 * Ablauf nach einem Barcode-Scan:
 *  1. Lokale ShopCalc-Datenbank (Produkt + eigene Preise) – sofort, auch offline.
 *  2. Produktdaten: Open Food / Beauty / Pet Food / Products Facts (universelle Abfrage).
 *  3. Öffentliche Preise: Open Prices – NUR für Lebensmittel.
 * Es werden niemals Preise geschätzt oder erfunden; fehlt ein Preis, folgt die manuelle Eingabe.
 */
import { lookupProduct, type FactsResult } from '../api/openFacts';
import { fetchOpenPrices } from '../api/openPrices';
import type { FetchLike } from '../api/http';
import { findProductByBarcode, listPrices, saveExternalPrices, upsertProduct } from '../db/repo';
import { rememberProductPrice } from '../db/remember';
import { normalizeBarcode } from '../lib/barcode';
import { isStale } from '../lib/prices';
import type { PriceRecord, Product, Store } from '../lib/types';

export type ProductLookupStatus = 'local' | FactsResult['status'] | 'disabled';

export interface ProductLookup {
  product: Product | null;
  status: ProductLookupStatus;
}

/** Findet das Produkt lokal und ergänzt es bei Bedarf aus den Open-*-Facts-Datenbanken. */
export async function resolveProduct(
  rawBarcode: string,
  { useFacts, force = false, fetchImpl }: { useFacts: boolean; force?: boolean; fetchImpl?: FetchLike },
): Promise<ProductLookup> {
  const barcode = normalizeBarcode(rawBarcode);
  const local = (await findProductByBarcode(barcode)) ?? null;
  // Online nur nachschlagen, wenn das Produkt fehlt oder noch nie online abgeglichen wurde
  const needsRemote = force || !local || !local.productType || !local.imageUrl;
  if (!needsRemote) return { product: local, status: 'local' };
  if (!useFacts) return { product: local, status: local ? 'local' : 'disabled' };

  const res = await lookupProduct(barcode, { fetchImpl });
  if (res.status !== 'found') return { product: local, status: local && res.status === 'not-found' ? 'local' : res.status };
  const f = res.product;
  const product = await upsertProduct(
    {
      barcode,
      name: f.name,
      brand: f.brand,
      size: f.size,
      category: f.category,
      imageUrl: f.imageUrl,
      productType: f.productType,
      source: f.source,
    },
    // Selbst erfasste Angaben haben Vorrang vor Online-Daten
    { onlyFillEmpty: !!local && local.source === 'user' },
  );
  return { product, status: 'found' };
}

export type PriceLookupStatus = 'ok' | 'skipped-not-food' | 'offline' | 'error' | 'disabled' | 'no-barcode';

/** Holt öffentliche Preise (Open Prices) und speichert sie lokal mit Quelle und Datum. */
export async function refreshExternalPrices(
  product: Product,
  { useOpenPrices, stores, fetchImpl }: { useOpenPrices: boolean; stores: Pick<Store, 'id' | 'name'>[]; fetchImpl?: FetchLike },
): Promise<{ status: PriceLookupStatus; found: number }> {
  if (!useOpenPrices) return { status: 'disabled', found: 0 };
  if (!product.barcode) return { status: 'no-barcode', found: 0 };
  const res = await fetchOpenPrices(product.barcode, product.productType, stores, { fetchImpl });
  if (res.status === 'skipped') return { status: 'skipped-not-food', found: 0 };
  if (res.status !== 'ok') return { status: res.status, found: 0 };
  await saveExternalPrices(product.id, res.prices);
  return { status: 'ok', found: res.prices.length };
}

export async function loadPrices(product: Product | null): Promise<PriceRecord[]> {
  return product ? listPrices(product.id) : [];
}

/**
 * Schlägt einen Preis zur Vorauswahl vor – ausschließlich tatsächlich vorhandene Preise:
 *  1. eigener, aktueller Preis im aktuellen Markt
 *  2. eigener, aktueller Preis in einem anderen Markt
 *  3. aktueller, belegter Filialpreis aus Open Prices in Deutschland
 * Ältere, geschätzte und Onlinepreise werden angezeigt, aber nie automatisch gewählt.
 */
export function suggestPrice(
  prices: PriceRecord[],
  currentStoreId: string | null,
  staleAfterDays: number,
  now = Date.now(),
): PriceRecord | null {
  const fresh = prices.filter((p) => !p.estimated && p.channel === 'store' && !isStale(p.recordedAt, staleAfterDays, now));
  const newest = (list: PriceRecord[]) => [...list].sort((a, b) => b.recordedAt - a.recordedAt)[0] ?? null;
  const own = fresh.filter((p) => p.source === 'manual');
  return (
    (currentStoreId ? newest(own.filter((p) => p.storeId === currentStoreId)) : null) ??
    newest(own) ??
    newest(
      fresh.filter(
        (p) => p.source === 'openprices' && p.countryCode === 'DE' && (p.proof === 'price_tag' || p.proof === 'receipt'),
      ),
    )
  );
}

/** Speichert einen manuell eingegebenen Preis zu einem gescannten Barcode (legt das Produkt ggf. an). */
export async function saveManualPrice(input: {
  barcode: string;
  product: Product | null;
  name: string;
  storeId: string | null;
  priceCents: number;
  estimated: boolean;
}): Promise<string | null> {
  return rememberProductPrice({
    productId: input.product?.id ?? null,
    barcode: normalizeBarcode(input.barcode),
    name: input.name.trim() || input.product?.name || '',
    storeId: input.storeId,
    priceCents: input.priceCents,
    estimated: input.estimated,
  });
}

/** Wie alt die zuletzt abgerufenen Open-Prices-Daten sind (für den Offline-Hinweis). */
export function externalFetchedAt(prices: PriceRecord[]): number | null {
  const ts = prices.filter((p) => p.source === 'openprices' && p.fetchedAt).map((p) => p.fetchedAt!);
  return ts.length ? Math.max(...ts) : null;
}


