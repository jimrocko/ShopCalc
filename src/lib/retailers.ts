/**
 * Zuordnung von Filialen (aus Open Prices / OpenStreetMap) zu Händlern.
 * Händler = Kette (z. B. EDEKA), Markt = konkrete Filiale (z. B. "E center, Hamburg").
 */
import type { Store } from './types';

/** Schreibweisen und Vertriebsformate der vorinstallierten Händler (Kleinschreibung) */
export const RETAILER_ALIASES: Record<string, string[]> = {
  rewe: ['rewe', 'rewe city', 'rewe center', 'rewe to go', 'rewe markt'],
  edeka: ['edeka', 'e center', 'e-center', 'e aktiv', 'e-aktiv', 'e neukauf', 'edeka center', 'edeka xpress', 'edeka foodservice'],
  aldi: ['aldi', 'aldi nord', 'aldi süd', 'aldi sud', 'aldi sued'],
  lidl: ['lidl'],
  kaufland: ['kaufland'],
};

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** true, wenn `text` mit `alias` als ganzem Wort beginnt („EDEKA Müller“ ja, „Edekamp“ nein) */
function startsWithWord(text: string, alias: string): boolean {
  if (!text.startsWith(alias)) return false;
  const next = text.charAt(alias.length);
  return next === '' || /[\s\-–,.·/]/.test(next);
}

/**
 * Ermittelt den ShopCalc-Händler zu einer Filiale. Nur für Deutschland, da gleiche Ketten
 * im Ausland andere Preise haben. Eigene (vom Nutzer angelegte) Märkte werden über ihren Namen erkannt.
 */
export function matchRetailer(
  brand: string,
  name: string,
  countryCode: string,
  stores: Pick<Store, 'id' | 'name'>[],
): string | null {
  if (countryCode !== 'DE') return null;
  const candidates = [norm(brand), norm(name)].filter(Boolean);
  if (candidates.length === 0) return null;
  for (const store of stores) {
    const aliases = RETAILER_ALIASES[store.id] ?? [norm(store.name)];
    for (const text of candidates) {
      if (aliases.some((a) => startsWithWord(text, a))) return store.id;
    }
  }
  return null;
}
