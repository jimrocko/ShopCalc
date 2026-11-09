/**
 * Open Food Facts – freie, kostenlose Produktdatenbank (Open Database License).
 * Liefert ausschließlich Stammdaten (Name, Marke, Größe, Kategorie) – KEINE Preise.
 * Dokumentation: https://openfoodfacts.github.io/openfoodfacts-server/api/
 */
export interface OffProduct {
  barcode: string;
  name: string;
  brand: string;
  size: string;
  category: string;
  imageUrl: string | null;
}

export type OffResult =
  | { status: 'found'; product: OffProduct }
  | { status: 'not-found' }
  | { status: 'offline' }
  | { status: 'error'; message: string };

const FIELDS = [
  'code',
  'product_name',
  'product_name_de',
  'generic_name_de',
  'brands',
  'quantity',
  'categories',
  'categories_tags',
  'image_front_small_url',
].join(',');

const BASE = 'https://world.openfoodfacts.org/api/v2/product/';

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Wählt eine gut lesbare Kategorie (letzter deutscher bzw. englischer Eintrag). */
function pickCategory(p: Record<string, unknown>): string {
  const cats = str(p.categories)
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c && !c.includes(':'));
  if (cats.length) return cats[cats.length - 1];
  const tags = Array.isArray(p.categories_tags) ? (p.categories_tags as unknown[]).map(String) : [];
  const de = tags.filter((t) => t.startsWith('de:'));
  const tag = (de.length ? de : tags)[de.length ? de.length - 1 : tags.length - 1];
  if (!tag) return '';
  const name = tag.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function parseOffResponse(barcode: string, json: unknown): OffResult {
  if (typeof json !== 'object' || json === null) return { status: 'error', message: 'Ungültige Antwort' };
  const j = json as Record<string, unknown>;
  if (j.status !== 1 || typeof j.product !== 'object' || j.product === null) return { status: 'not-found' };
  const p = j.product as Record<string, unknown>;
  const name = str(p.product_name_de) || str(p.product_name) || str(p.generic_name_de);
  const brand = str(p.brands).split(',')[0]?.trim() ?? '';
  if (!name && !brand) return { status: 'not-found' };
  return {
    status: 'found',
    product: {
      barcode,
      name: name || brand,
      brand,
      size: str(p.quantity),
      category: pickCategory(p),
      imageUrl: str(p.image_front_small_url) || null,
    },
  };
}

export async function lookupBarcode(
  barcode: string,
  { timeoutMs = 7000, fetchImpl = fetch }: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<OffResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'offline' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${BASE}${encodeURIComponent(barcode)}.json?fields=${FIELDS}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (res.status === 404) return { status: 'not-found' };
    if (!res.ok) return { status: 'error', message: `HTTP ${res.status}` };
    return parseOffResponse(barcode, await res.json());
  } catch (e) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'offline' };
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    return { status: 'error', message: aborted ? 'Zeitüberschreitung' : 'Netzwerkfehler' };
  } finally {
    clearTimeout(timer);
  }
}
