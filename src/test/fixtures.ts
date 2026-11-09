/** Gekürzte, echte Antworten der APIs (Stand 11/2026) */
export const FOOD_COLA = {
  code: '5449000000996',
  errors: [],
  product: {
    brands: 'COCA-COLA SERVICES SA/NV',
    categories: 'Colas, pt:bebidas cafeína',
    code: '5449000000996',
    image_front_small_url: 'https://images.openfoodfacts.org/images/products/544/900/000/0996/front_en.1129.200.jpg',
    product_name: 'Coca-Cola Original',
    product_name_de: 'Coca-Cola',
    product_type: 'food',
    quantity: '330 ml',
  },
  result: { id: 'product_found' },
  status: 'success',
};

export const BEAUTY_LOREAL = {
  code: '3600523614417',
  errors: [],
  product: {
    brands: "L'OREAL NORGE AS",
    categories: 'non-food-products, open-beauty-facts',
    code: '3600523614417',
    image_front_small_url: 'https://images.openbeautyfacts.org/images/products/360/052/361/4417/front_en.3.200.jpg',
    product_name: "L'Oreal Infallible Foundation True Beige 130",
    product_type: 'beauty',
    quantity: '',
  },
  result: { id: 'product_found' },
  status: 'success',
};

export const PRODUCT_OTHER = {
  code: '4006381333931',
  product: { product_name: 'Textmarker gelb', brands: 'Stabilo', product_type: 'product', categories: 'Bürobedarf' },
  result: { id: 'product_found' },
};

/** Barcode existiert als leerer Datensatz (kommt real vor) */
export const EMPTY_PRODUCT = { code: '2000000000008', product: { code: '2000000000008' }, result: { id: 'product_found' } };

export const NOT_FOUND = { code: '4012345678901', result: { id: 'product_not_found' }, status: 'failure' };

const loc = (over: Record<string, unknown>) => ({
  type: 'OSM',
  osm_name: 'Filiale',
  osm_brand: null,
  osm_address_city: 'Berlin',
  osm_address_country_code: 'DE',
  website_url: null,
  ...over,
});

export const OPEN_PRICES_COLA = {
  page: 1,
  pages: 1,
  size: 20,
  total: 6,
  items: [
    { id: 900006, type: 'PRODUCT', price: 1.19, currency: 'EUR', date: '2026-11-05', price_is_discounted: false, duplicate_of: null, location_id: 254, location: loc({ osm_brand: 'Rewe', osm_name: 'REWE City', osm_type: 'NODE', osm_id: 4711 }), proof: { type: 'PRICE_TAG' } },
    { id: 900001, type: 'PRODUCT', price: 0.99, currency: 'EUR', date: '2026-11-01', price_is_discounted: false, duplicate_of: null, location: loc({ osm_brand: 'Lidl', osm_name: 'Lidl' }), proof: { type: 'PRICE_TAG' } },
    { id: 900002, type: 'PRODUCT', price: 1.1, currency: 'EUR', date: '2026-04-06', price_is_discounted: false, duplicate_of: null, location: loc({ osm_brand: 'HiperDino', osm_name: 'HiperDino Express', osm_address_city: 'Los Cristianos', osm_address_country_code: 'ES' }), proof: { type: 'RECEIPT' } },
    { id: 900003, type: 'PRODUCT', price: 1.29, currency: 'EUR', date: '2026-10-20', price_is_discounted: true, duplicate_of: null, location: { type: 'ONLINE', website_url: 'https://www.rewe.de' }, proof: { type: 'RECEIPT' } },
    // ignoriert: andere Währung, Duplikat, ungültiger Preis
    { id: 900004, type: 'PRODUCT', price: 12.5, currency: 'SEK', date: '2026-10-20', duplicate_of: null, location: loc({}), proof: { type: 'PRICE_TAG' } },
    { id: 900005, type: 'PRODUCT', price: 0.99, currency: 'EUR', date: '2026-11-01', duplicate_of: 900001, location: loc({}), proof: { type: 'PRICE_TAG' } },
  ],
};

export const OPEN_PRICES_EMPTY = { page: 1, pages: 0, size: 20, total: 0, items: [] };

type Routes = Record<string, { status?: number; body: unknown }>;

/** Einfacher fetch-Ersatz: wählt die Antwort anhand eines Teilstrings der URL und protokolliert Aufrufe. */
export function mockFetch(routes: Routes) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response(JSON.stringify({ result: { id: 'product_not_found' } }), { status: 404 });
    const r = routes[key];
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { impl, calls };
}

/** Produktdaten aus Open Prices (Ausweichquelle) */
export const OP_PRODUCT_COLA = {
  id: 498612,
  code: '5449000000996',
  source: 'off',
  product_name: 'Coca-Cola Original',
  image_url: 'https://images.openfoodfacts.org/images/products/544/900/000/0996/front_en.1129.400.jpg',
  quantity: '330 ml',
  brands: 'COCA-COLA SERVICES SA/NV',
};
export const OP_PRODUCT_EMPTY = { id: 1, code: '4012345678901', source: null, product_name: null };
