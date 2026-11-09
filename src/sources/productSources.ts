/**
 * Produktquellen (Erkennung über GTIN/EAN), jeweils einzeln gekapselt:
 *  1. Lokale ShopCalc-Datenbank
 *  2. Open Food / Beauty / Pet Food / Products Facts (universelle Abfrage product_type=all)
 *  3. Open Prices Produktdaten – Ausweichquelle, falls 2. nicht erreichbar ist oder nichts findet
 * Produktdaten enthalten nie Preise.
 */
import { lookupProduct, type FactsProduct, type FactsResult } from '../api/openFacts';
import { lookupOpenPricesProduct } from '../api/openPrices';
import type { FetchLike } from '../api/http';
import { runSource, type SourceReport } from './types';

function reportFrom(r: FactsResult): Omit<SourceReport, 'id' | 'label' | 'kind'> {
  switch (r.status) {
    case 'found':
      return { status: 'ok', count: 1, detail: r.product.name };
    case 'not-found':
      return { status: 'empty', count: 0, detail: 'Barcode nicht bekannt' };
    case 'offline':
      return { status: 'offline', count: 0, detail: 'Keine Internetverbindung' };
    case 'error':
      return { status: 'error', count: 0, detail: r.message };
  }
}

export interface RemoteProductResult {
  product: FactsProduct | null;
  status: FactsResult['status'];
  reports: SourceReport[];
}

/** Fragt die Online-Produktquellen nacheinander ab, bis eine das Produkt kennt. */
export async function findRemoteProduct(barcode: string, fetchImpl?: FetchLike): Promise<RemoteProductResult> {
  const reports: SourceReport[] = [];
  let found: FactsProduct | null = null;
  const statuses: FactsResult['status'][] = [];

  const chain: Array<{ id: string; label: string; run: () => Promise<FactsResult> }> = [
    { id: 'openfacts', label: 'Open Food/Beauty/Products Facts', run: () => lookupProduct(barcode, { fetchImpl }) },
    { id: 'openprices-product', label: 'Open Prices (Produktdaten)', run: () => lookupOpenPricesProduct(barcode, { fetchImpl }) },
  ];
  for (const src of chain) {
    if (found) break;
    const holder: { result: FactsResult } = { result: { status: 'error', message: 'Fehler' } };
    reports.push(
      await runSource({ id: src.id, label: src.label, kind: 'product' }, async () => {
        holder.result = await src.run();
        return reportFrom(holder.result);
      }),
    );
    const result = holder.result;
    statuses.push(result.status);
    if (result.status === 'found') found = result.product;
    // Offline: weitere Online-Quellen sind ebenfalls nicht erreichbar
    if (result.status === 'offline') break;
  }
  // Gesamtstatus: gefunden > nicht gefunden (eine Quelle hat sicher geantwortet) > Fehler > offline
  const status: FactsResult['status'] = found
    ? 'found'
    : statuses.includes('not-found')
      ? 'not-found'
      : statuses.includes('error')
        ? 'error'
        : statuses.includes('offline')
          ? 'offline'
          : 'not-found';
  return { product: found, status, reports };
}
