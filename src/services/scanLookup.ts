/**
 * Ablauf nach einem Barcode-Scan:
 *  1. Produkt erkennen: lokale Datenbank → Open Food/Beauty/Products Facts → Open Prices (Produktdaten).
 *  2. Preise suchen: alle Preisquellen unabhängig voneinander (eigene Preise, Open Prices, Händler-Status).
 *  3. Vorschlag: nur tatsächlich vorhandene, aktuelle Filialpreise – nie geschätzt, nie aus Produktdaten.
 * Fehlt ein Preis, folgt die manuelle Eingabe.
 */
import type { FactsResult } from '../api/openFacts';
import type { FetchLike } from '../api/http';
import { findProductByBarcode, listPrices, upsertProduct } from '../db/repo';
import { rememberProductPrice } from '../db/remember';
import { normalizeBarcode } from '../lib/barcode';
import { isStale } from '../lib/prices';
import type { PriceRecord, Product, Store } from '../lib/types';
import { findRemoteProduct } from '../sources/productSources';
import { openPricesSource, runPriceSources } from '../sources/priceSources';
import type { SourceReport } from '../sources/types';

export type ProductLookupStatus = 'local' | FactsResult['status'] | 'disabled';

export interface ProductLookup {
  product: Product | null;
  status: ProductLookupStatus;
  reports: SourceReport[];
}

const localReport = (product: Product | null): SourceReport => ({
  id: 'local-product',
  label: 'ShopCalc (lokal)',
  kind: 'product',
  status: product ? 'ok' : 'empty',
  count: product ? 1 : 0,
  detail: product ? 'Produkt gespeichert' : 'Noch nicht gespeichert',
});

/** Findet das Produkt lokal (Abgleich über die normalisierte GTIN) und ergänzt es bei Bedarf online. */
export async function resolveProduct(
  rawBarcode: string,
  { useFacts, force = false, fetchImpl }: { useFacts: boolean; force?: boolean; fetchImpl?: FetchLike },
): Promise<ProductLookup> {
  const barcode = normalizeBarcode(rawBarcode);
  const local = (await findProductByBarcode(barcode)) ?? null;
  const reports = [localReport(local)];
  // Online nur nachschlagen, wenn das Produkt fehlt oder noch nie online abgeglichen wurde
  const needsRemote = force || !local || !local.productType || !local.imageUrl;
  if (!needsRemote) return { product: local, status: 'local', reports };
  if (!useFacts) return { product: local, status: local ? 'local' : 'disabled', reports };

  const remote = await findRemoteProduct(barcode, fetchImpl);
  reports.push(...remote.reports);
  if (!remote.product) {
    return { product: local, status: local && remote.status === 'not-found' ? 'local' : local ? 'local' : remote.status, reports };
  }
  const f = remote.product;
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
  return { product, status: 'found', reports };
}

export interface PriceLookupOptions {
  useOpenPrices: boolean;
  stores: Pick<Store, 'id' | 'name'>[];
  currentStoreId?: string | null;
  fetchImpl?: FetchLike;
}

/** Fragt alle Preisquellen ab (unabhängig voneinander) und liefert je Quelle einen Bericht. */
export async function lookupPrices(product: Product, opts: PriceLookupOptions): Promise<SourceReport[]> {
  return runPriceSources(product, { ...opts, currentStoreId: opts.currentStoreId ?? null });
}

export type PriceLookupStatus = 'ok' | 'skipped-not-food' | 'offline' | 'error' | 'disabled' | 'no-barcode';

/** Nur Open Prices aktualisieren (z. B. aus der Produktansicht). */
export async function refreshExternalPrices(
  product: Product,
  opts: PriceLookupOptions,
): Promise<{ status: PriceLookupStatus; found: number }> {
  if (!product.barcode) return { status: 'no-barcode', found: 0 };
  const r = await openPricesSource(product, { ...opts, currentStoreId: opts.currentStoreId ?? null });
  const map: Record<SourceReport['status'], PriceLookupStatus> = {
    ok: 'ok',
    empty: 'ok',
    skipped: 'skipped-not-food',
    offline: 'offline',
    error: 'error',
    disabled: 'disabled',
    unavailable: 'error',
  };
  return { status: map[r.status], found: r.count };
}

export async function loadPrices(product: Product | null): Promise<PriceRecord[]> {
  return product ? listPrices(product.id) : [];
}

/**
 * Schlägt einen Preis zur Vorauswahl vor – ausschließlich tatsächlich vorhandene, aktuelle Filialpreise:
 *  1. eigener Preis beim gewählten Händler
 *  2. belegter Open-Prices-Preis aus einer Filiale des gewählten Händlers (Deutschland)
 *  3. eigener Preis bei einem anderen Händler
 *  4. belegter Open-Prices-Preis aus einer anderen deutschen Filiale
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
  const publicDe = fresh.filter(
    (p) => p.source === 'openprices' && p.countryCode === 'DE' && (p.proof === 'price_tag' || p.proof === 'receipt'),
  );
  const atRetailer = (list: PriceRecord[]) => (currentStoreId ? list.filter((p) => p.storeId === currentStoreId) : []);
  return newest(atRetailer(own)) ?? newest(atRetailer(publicDe)) ?? newest(own) ?? newest(publicDe);
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

/** Wann die gespeicherten Open-Prices-Daten zuletzt abgerufen wurden (für den Offline-Hinweis). */
export function externalFetchedAt(prices: PriceRecord[]): number | null {
  const ts = prices.filter((p) => p.source === 'openprices' && p.fetchedAt).map((p) => p.fetchedAt!);
  return ts.length ? Math.max(...ts) : null;
}
