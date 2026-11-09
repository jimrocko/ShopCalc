/**
 * Preisquellen, jeweils einzeln gekapselt und parallel ausgeführt (Promise.all über runSource –
 * ein Fehler einer Quelle blockiert die anderen nicht):
 *  1. Lokale ShopCalc-Datenbank (eigene Preise)
 *  2. Open Prices – öffentliche, belegte Preise (nur Lebensmittel)
 *  3. REWE / EDEKA – keine offizielle Schnittstelle vorhanden (nur Statusmeldung, keine Abfrage)
 */
import { fetchOpenPrices } from '../api/openPrices';
import type { FetchLike } from '../api/http';
import { listPrices, saveExternalPrices } from '../db/repo';
import type { Product, Store } from '../lib/types';
import { retailerApiReports } from './retailerApis';
import { runSource, type SourceReport } from './types';

export interface PriceSourceContext {
  useOpenPrices: boolean;
  stores: Pick<Store, 'id' | 'name'>[];
  /** Händler, in dem gerade eingekauft wird */
  currentStoreId: string | null;
  fetchImpl?: FetchLike;
}

export function localPriceSource(product: Product): Promise<SourceReport> {
  return runSource({ id: 'local', label: 'ShopCalc (eigene Preise)', kind: 'price' }, async () => {
    const own = (await listPrices(product.id)).filter((p) => p.source === 'manual');
    return own.length
      ? { status: 'ok', count: own.length, detail: `${own.length} eigene${own.length === 1 ? 'r' : ''} Preis${own.length === 1 ? '' : 'e'}` }
      : { status: 'empty', count: 0, detail: 'Noch kein eigener Preis' };
  });
}

export function openPricesSource(product: Product, ctx: PriceSourceContext): Promise<SourceReport> {
  return runSource({ id: 'openprices', label: 'Open Prices', kind: 'price' }, async () => {
    if (!ctx.useOpenPrices) return { status: 'disabled', count: 0, detail: 'In den Einstellungen deaktiviert' };
    if (!product.barcode) return { status: 'skipped', count: 0, detail: 'Kein Barcode' };
    const res = await fetchOpenPrices(product.barcode, product.productType, ctx.stores, { fetchImpl: ctx.fetchImpl });
    if (res.status === 'skipped') {
      return { status: 'skipped', count: 0, detail: 'Nur für Lebensmittel – für diese Produktart gibt es keine freie Preisdatenbank' };
    }
    if (res.status === 'offline') return { status: 'offline', count: 0, detail: 'Keine Internetverbindung – gespeicherte Preise werden gezeigt' };
    if (res.status === 'error') return { status: 'error', count: 0, detail: res.message };
    await saveExternalPrices(product.id, res.prices);
    if (res.prices.length === 0) return { status: 'empty', count: 0, detail: 'Keine Preise erfasst' };
    const atRetailer = ctx.currentStoreId ? res.prices.filter((p) => p.storeId === ctx.currentStoreId).length : 0;
    const de = res.prices.filter((p) => p.countryCode === 'DE' && p.channel === 'store').length;
    const n = res.prices.length;
    const parts = [`${n} ${n === 1 ? 'Preis' : 'Preise'}`, `${de} aus deutschen Filialen`];
    if (ctx.currentStoreId) parts.push(`${atRetailer} beim gewählten Händler`);
    return { status: 'ok', count: res.prices.length, detail: parts.join(' · ') };
  });
}

/** Führt alle Preisquellen unabhängig voneinander aus. */
export async function runPriceSources(product: Product, ctx: PriceSourceContext): Promise<SourceReport[]> {
  const [remote] = await Promise.all([openPricesSource(product, ctx)]);
  // Lokale Quelle zuletzt auswerten, damit sie den aktuellen Datenbankstand zählt
  const local = await localPriceSource(product);
  return [local, remote, ...retailerApiReports()];
}
