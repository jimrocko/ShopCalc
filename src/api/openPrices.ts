/**
 * Open Prices (https://prices.openfoodfacts.org) – freie, gemeinschaftlich gepflegte Preisdatenbank
 * des Open-Food-Facts-Projekts (Daten unter ODbL, kostenlos, ohne Schlüssel für Lesezugriffe).
 * Jeder Preis stammt von einer realen Person und ist i. d. R. mit Preisschild- oder Kassenbon-Foto belegt.
 *
 * Open Prices ist auf Lebensmittel ausgerichtet. ShopCalc fragt deshalb NUR bei Produkten der Art
 * „food“ ab – nicht für Kosmetik, Tiernahrung oder sonstige Produkte.
 */
import { fetchJson, type FetchLike } from './http';
import { eurosToCents } from '../lib/money';
import { matchRetailer } from '../lib/retailers';
import type { ExternalPriceInput } from '../db/repo';
import type { PriceProof, ProductType, Store } from '../lib/types';
import type { FactsProduct, FactsResult } from './openFacts';

export const OPEN_PRICES_URL = 'https://prices.openfoodfacts.org/api/v1/prices';

export type OpenPricesResult =
  | { status: 'ok'; prices: ExternalPriceInput[]; total: number }
  | { status: 'skipped'; reason: 'not-food' }
  | { status: 'offline' }
  | { status: 'error'; message: string };

/** Nur für diese Produktarten ist Open Prices eine geeignete Quelle. */
export function openPricesApplies(productType: ProductType | null): boolean {
  return productType === 'food';
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

const PROOFS: Record<string, PriceProof> = {
  PRICE_TAG: 'price_tag',
  RECEIPT: 'receipt',
  GDPR_REQUEST: 'gdpr_request',
  SHOP_IMPORT: 'shop_import',
};

/** "2026-04-06" → Zeitstempel (12:00 UTC, damit die Zeitzone das Datum nicht verschiebt) */
export function parseDate(d: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
}

/** Ordnet eine Filiale einem ShopCalc-Händler zu (nur in Deutschland, über Marke bzw. Name). */
export function matchStore(brandOrName: string, countryCode: string, stores: Pick<Store, 'id' | 'name'>[]): string | null {
  return matchRetailer(brandOrName, '', countryCode, stores);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function parseOpenPrices(json: unknown, stores: Pick<Store, 'id' | 'name'>[], fetchedAt = Date.now()): ExternalPriceInput[] {
  if (typeof json !== 'object' || json === null) return [];
  const items = (json as Record<string, unknown>).items;
  if (!Array.isArray(items)) return [];
  const out: ExternalPriceInput[] = [];
  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null) continue;
    const it = raw as Record<string, unknown>;
    if (it.type !== undefined && it.type !== 'PRODUCT') continue;
    if (it.duplicate_of !== null && it.duplicate_of !== undefined) continue;
    if (str(it.currency) !== 'EUR') continue;
    if (typeof it.price !== 'number' || !(it.price > 0)) continue;
    const cents = eurosToCents(it.price);
    const recordedAt = parseDate(str(it.date));
    if (cents === null || cents <= 0 || recordedAt === null) continue;
    const loc = (typeof it.location === 'object' && it.location !== null ? it.location : {}) as Record<string, unknown>;
    const proof = (typeof it.proof === 'object' && it.proof !== null ? it.proof : {}) as Record<string, unknown>;
    const online = loc.type === 'ONLINE';
    const countryCode = str(loc.osm_address_country_code).toUpperCase();
    let locationLabel: string;
    let marketId: string | undefined;
    let storeId: string | null = null;
    if (online) {
      const host = hostOf(str(loc.website_url));
      locationLabel = host || 'Onlineshop';
      marketId = host ? `online:${host}` : undefined;
      // Onlineshop eines Händlers (z. B. rewe.de) dem Händler zuordnen – bleibt aber als Onlinepreis gekennzeichnet
      storeId = host ? matchRetailer(host.split('.')[0], '', 'DE', stores) : null;
    } else {
      const brand = str(loc.osm_brand);
      const name = str(loc.osm_name);
      const city = str(loc.osm_address_city);
      storeId = matchRetailer(brand, name, countryCode, stores);
      // Markt: Filialname (enthält oft den Betreiber, z. B. „EDEKA Müller“) + Ort
      locationLabel = [name || brand || 'Filiale', city, countryCode && countryCode !== 'DE' ? countryCode : '']
        .filter(Boolean)
        .join(', ');
      if (loc.osm_type && loc.osm_id) marketId = `osm:${String(loc.osm_type).toLowerCase()}:${String(loc.osm_id)}`;
      else if (typeof it.location_id === 'number') marketId = `op:${it.location_id}`;
    }
    out.push({
      externalId: String(it.id),
      source: 'openprices',
      channel: online ? 'online' : 'store',
      storeId,
      priceCents: cents,
      recordedAt,
      locationLabel,
      marketId,
      countryCode: countryCode || undefined,
      proof: PROOFS[str(proof.type)] ?? 'unknown',
      discounted: it.price_is_discounted === true,
      fetchedAt,
    });
  }
  return out;
}

export async function fetchOpenPrices(
  barcode: string,
  productType: ProductType | null,
  stores: Pick<Store, 'id' | 'name'>[],
  opts: { timeoutMs?: number; fetchImpl?: FetchLike; limit?: number } = {},
): Promise<OpenPricesResult> {
  if (!openPricesApplies(productType)) return { status: 'skipped', reason: 'not-food' };
  const params = new URLSearchParams({
    product_code: barcode,
    currency: 'EUR',
    order_by: '-date',
    size: String(opts.limit ?? 100),
  });
  const res = await fetchJson(`${OPEN_PRICES_URL}?${params}`, opts);
  if (!res.ok) {
    if (res.reason === 'offline') return { status: 'offline' };
    return { status: 'error', message: res.reason === 'timeout' ? 'Zeitüberschreitung' : 'Preise nicht abrufbar' };
  }
  const body = res.json as Record<string, unknown> | null;
  const total = typeof body?.total === 'number' ? body.total : 0;
  return { status: 'ok', prices: parseOpenPrices(res.json, stores), total };
}

/* ---------- Produktdaten aus Open Prices (Ausweichquelle für die Erkennung) ---------- */

const OP_SOURCE: Record<string, { productType: ProductType; source: FactsProduct['source'] }> = {
  off: { productType: 'food', source: 'openfoodfacts' },
  obf: { productType: 'beauty', source: 'openbeautyfacts' },
  opff: { productType: 'petfood', source: 'openpetfoodfacts' },
  opf: { productType: 'product', source: 'openproductsfacts' },
};

export function parseOpenPricesProduct(barcode: string, json: unknown): FactsResult {
  if (typeof json !== 'object' || json === null) return { status: 'error', message: 'Ungültige Antwort' };
  const p = json as Record<string, unknown>;
  const name = str(p.product_name);
  const brand = str(p.brands).split(',')[0]?.trim() ?? '';
  const mapped = OP_SOURCE[str(p.source)];
  // Ohne Name/Marke oder ohne bekannte Herkunft ist das kein verwertbarer Treffer
  if ((!name && !brand) || !mapped) return { status: 'not-found' };
  return {
    status: 'found',
    product: {
      barcode,
      name: name || brand,
      brand,
      size: str(p.quantity),
      category: '',
      imageUrl: str(p.image_url) || null,
      productType: mapped.productType,
      source: mapped.source,
    },
  };
}

export async function lookupOpenPricesProduct(
  barcode: string,
  opts: { timeoutMs?: number; fetchImpl?: FetchLike } = {},
): Promise<FactsResult> {
  const res = await fetchJson(`https://prices.openfoodfacts.org/api/v1/products/code/${encodeURIComponent(barcode)}`, {
    ...opts,
    okStatuses: [404],
  });
  if (!res.ok) return res.reason === 'offline' ? { status: 'offline' } : { status: 'error', message: 'Nicht erreichbar' };
  if (res.status === 404) return { status: 'not-found' };
  return parseOpenPricesProduct(barcode, res.json);
}
