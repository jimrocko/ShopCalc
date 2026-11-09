/**
 * Produkterkennung über die freien Open-*-Facts-Datenbanken (Open Database License, kostenlos, ohne Schlüssel):
 * Open Food Facts (Lebensmittel), Open Beauty Facts (Kosmetik), Open Pet Food Facts (Tiernahrung)
 * und Open Products Facts (sonstige Produkte).
 *
 * Universelle Abfrage: GET https://world.openfoodfacts.org/api/v3/product/{barcode}?product_type=all
 * Gehört der Barcode zu einer anderen Datenbank, leitet der Server automatisch dorthin weiter.
 * Doku: https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/scanning-cosmetics-pet-food-and-other-products/
 *
 * WICHTIG: Diese Datenbanken enthalten KEINE Preise.
 */
import { fetchJson, type FetchLike } from './http';
import type { ProductSource, ProductType } from '../lib/types';

export interface FactsProduct {
  barcode: string;
  name: string;
  brand: string;
  size: string;
  category: string;
  imageUrl: string | null;
  productType: ProductType;
  source: Exclude<ProductSource, 'user'>;
}

export type FactsResult =
  | { status: 'found'; product: FactsProduct }
  | { status: 'not-found' }
  | { status: 'offline' }
  | { status: 'error'; message: string };

export const FACTS_SOURCE_LABEL: Record<ProductSource, string> = {
  user: 'Selbst erfasst',
  openfoodfacts: 'Open Food Facts',
  openbeautyfacts: 'Open Beauty Facts',
  openpetfoodfacts: 'Open Pet Food Facts',
  openproductsfacts: 'Open Products Facts',
};

const TYPE_TO_SOURCE: Record<ProductType, FactsProduct['source']> = {
  food: 'openfoodfacts',
  beauty: 'openbeautyfacts',
  petfood: 'openpetfoodfacts',
  product: 'openproductsfacts',
};

const FIELDS = [
  'code',
  'product_type',
  'product_name',
  'product_name_de',
  'generic_name_de',
  'generic_name',
  'brands',
  'quantity',
  'categories',
  'categories_tags',
  'image_front_small_url',
  'image_small_url',
  'image_front_url',
].join(',');

export const FACTS_URL = 'https://world.openfoodfacts.org/api/v3/product/';

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Kategorien, die nur die Datenbank selbst bezeichnen und für Nutzer keinen Mehrwert haben */
const META_CATEGORIES = /^(non-food-products|open-beauty-facts|open-products-facts|open-pet-food-facts)$/i;

function pickCategory(p: Record<string, unknown>): string {
  const cats = str(p.categories)
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c && !c.includes(':') && !META_CATEGORIES.test(c));
  if (cats.length) return cats[cats.length - 1];
  const tags = Array.isArray(p.categories_tags) ? (p.categories_tags as unknown[]).map(String) : [];
  const usable = tags.filter((t) => !META_CATEGORIES.test(t.replace(/^[a-z]{2}:/, '')));
  const de = usable.filter((t) => t.startsWith('de:'));
  const tag = de.length ? de[de.length - 1] : usable[usable.length - 1];
  if (!tag) return '';
  const name = tag.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function pickType(p: Record<string, unknown>): ProductType {
  const t = str(p.product_type);
  if (t === 'food' || t === 'beauty' || t === 'petfood' || t === 'product') return t;
  return 'food';
}

/** Wertet die v3-Antwort aus. Ein Treffer ohne Name UND ohne Marke gilt als „nicht gefunden“. */
export function parseFactsResponse(barcode: string, json: unknown): FactsResult {
  if (typeof json !== 'object' || json === null) return { status: 'error', message: 'Ungültige Antwort' };
  const j = json as Record<string, unknown>;
  const result = (j.result ?? {}) as Record<string, unknown>;
  const product = j.product;
  if (result.id === 'product_not_found' || typeof product !== 'object' || product === null) return { status: 'not-found' };
  const p = product as Record<string, unknown>;
  const name = str(p.product_name_de) || str(p.product_name) || str(p.generic_name_de) || str(p.generic_name);
  const brand = str(p.brands).split(',')[0]?.trim() ?? '';
  if (!name && !brand) return { status: 'not-found' };
  const productType = pickType(p);
  return {
    status: 'found',
    product: {
      barcode,
      name: name || brand,
      brand,
      size: str(p.quantity),
      category: pickCategory(p),
      imageUrl: str(p.image_front_small_url) || str(p.image_small_url) || str(p.image_front_url) || null,
      productType,
      source: TYPE_TO_SOURCE[productType],
    },
  };
}

export async function lookupProduct(
  barcode: string,
  opts: { timeoutMs?: number; fetchImpl?: FetchLike } = {},
): Promise<FactsResult> {
  const url = `${FACTS_URL}${encodeURIComponent(barcode)}?product_type=all&fields=${FIELDS}`;
  // 404 = Produkt unbekannt (Antwort trotzdem JSON)
  const res = await fetchJson(url, { ...opts, okStatuses: [404] });
  if (!res.ok) {
    if (res.reason === 'offline') return { status: 'offline' };
    return {
      status: 'error',
      message: res.reason === 'timeout' ? 'Zeitüberschreitung' : res.reason === 'http' ? `HTTP ${res.status}` : 'Netzwerkfehler',
    };
  }
  if (res.status === 404) return { status: 'not-found' };
  return parseFactsResponse(barcode, res.json);
}
