import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { listAllPrices, listProducts } from '../db/repo';
import type { PriceRecord, Product } from '../lib/types';
import { latestPerStore, isStale } from '../lib/prices';
import { formatCents } from '../lib/money';
import { ProductSheet } from '../components/ProductSheet';
import { Badge, inputClass } from '../components/ui';
import { IconBox, IconChevron, IconSearch } from '../components/icons';

export function ProductsView() {
  const { productsVersion, state } = useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [prices, setPrices] = useState<PriceRecord[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listProducts(), listAllPrices()])
      .then(([p, pr]) => {
        if (cancelled) return;
        setProducts(p);
        setPrices(pr);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [productsVersion]);

  const byProduct = useMemo(() => {
    const m = new Map<string, PriceRecord[]>();
    for (const p of prices) m.set(p.productId, [...(m.get(p.productId) ?? []), p]);
    return m;
  }, [prices]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      [p.name, p.brand, p.category, p.size, p.barcode ?? ''].some((v) => v.toLowerCase().includes(q)),
    );
  }, [products, query]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-[30px] font-bold tracking-tight">Produkte & Preise</h1>
        <p className="mt-1 text-[13px] text-muted">
          Lokal auf diesem Gerät gespeichert. Preise stammen aus deinen eigenen Eingaben oder – gekennzeichnet – aus Open Prices.
        </p>
      </div>

      <div className="relative">
        <IconSearch size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search"
          className={inputClass + ' pl-11'}
          placeholder="Name, Marke oder Barcode suchen"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loaded && products.length === 0 && (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-10 text-center">
          <IconBox size={32} className="text-muted" />
          <p className="mt-3 text-[15px] text-white/90">Noch keine Produkte gespeichert</p>
          <p className="mt-1 text-[13px] text-muted">
            Erfasse beim Einkaufen einen Preis mit Produktnamen oder scanne einen Barcode – ShopCalc merkt sich Produkt, Markt und Datum.
          </p>
        </div>
      )}

      {filtered.length > 0 && (
        <ul className="overflow-hidden rounded-3xl border border-line/50 bg-card">
          {filtered.map((p, i) => {
            const latest = latestPerStore(byProduct.get(p.id) ?? []);
            // Eigene Preise haben Vorrang vor öffentlichen
            const own = latest.filter((r) => r.source === 'manual');
            const newest = [...(own.length ? own : latest)].sort((a, b) => b.recordedAt - a.recordedAt)[0];
            const stale = newest ? isStale(newest.recordedAt, state.settings.staleAfterDays) : false;
            return (
              <li key={p.id} className={i > 0 ? 'border-t border-line/50' : ''}>
                <button type="button" className="tap flex w-full items-center gap-3 px-4 py-3 text-left active:bg-card2" onClick={() => setSelected(p.id)}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" loading="lazy" className="h-full w-full object-contain" />
                    ) : (
                      <IconBox size={20} className="text-neutral-400" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[16px] font-medium">{p.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
                      <span className="truncate">{[p.brand, p.size].filter(Boolean).join(' · ') || (p.barcode ? `EAN ${p.barcode}` : 'Ohne Details')}</span>
                      {latest.length > 1 && <Badge>{latest.length} Preise</Badge>}
                      {newest && newest.source !== 'manual' && <Badge tone="info">Open Prices</Badge>}
                      {stale && <Badge tone="warn">alt</Badge>}
                    </div>
                  </div>
                  {newest ? (
                    <span className="text-[16px] font-semibold tabular-nums">{formatCents(newest.priceCents)}</span>
                  ) : (
                    <span className="text-[13px] text-muted">kein Preis</span>
                  )}
                  <IconChevron size={18} className="text-muted" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {loaded && products.length > 0 && filtered.length === 0 && (
        <p className="text-center text-[14px] text-muted">Keine Treffer für „{query}“.</p>
      )}

      <ProductSheet productId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
