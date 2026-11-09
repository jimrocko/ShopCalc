import { findProductByName, recordPrice, upsertProduct } from './repo';
import type { Product } from '../lib/types';

export interface RememberInput {
  productId: string | null;
  barcode: string | null;
  name: string;
  brand?: string;
  size?: string;
  category?: string;
  source?: Product['source'];
  storeId: string | null;
  priceCents: number;
  estimated?: boolean;
}

/**
 * Merkt sich ein erfasstes Produkt samt Preis in der lokalen Datenbank.
 * Produkte ohne Namen und ohne Barcode werden nicht gespeichert.
 * Gibt die Produkt-ID zurück (oder null).
 */
export async function rememberProductPrice(input: RememberInput): Promise<string | null> {
  const name = input.name.trim();
  if (!name && !input.barcode) return null;
  let id = input.productId;
  if (!id && !input.barcode) {
    const byName = await findProductByName(name, input.size ?? '');
    id = byName?.id ?? null;
  }
  const product = await upsertProduct({
    id: id ?? undefined,
    barcode: input.barcode,
    // Ohne Namen: Barcode als vorläufiger Name (in „Produkte“ jederzeit änderbar)
    name: name || (input.barcode ? `Produkt ${input.barcode}` : ''),
    brand: input.brand,
    size: input.size,
    category: input.category,
    source: input.source,
  });
  if (input.priceCents > 0) await recordPrice(product.id, input.storeId, input.priceCents, Date.now(), { estimated: input.estimated });
  return product.id;
}
