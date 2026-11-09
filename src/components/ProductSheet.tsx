import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Label, MoneyInput, Sheet, inputClass } from './ui';
import { StorePicker } from './StorePicker';
import { useApp } from '../state/AppContext';
import { deletePrice, deleteProduct, getProduct, listPrices, recordPrice, upsertProduct } from '../db/repo';
import { buildComparison, formatAge, formatDate } from '../lib/prices';
import { formatCents } from '../lib/money';
import type { PriceRecord, Product } from '../lib/types';
import { IconTrash } from './icons';

export function ProductSheet({ productId, onClose }: { productId: string | null; onClose: () => void }) {
  const { state, stores, storeName, dispatch, showToast, bumpProducts, productsVersion } = useApp();
  const [product, setProduct] = useState<Product | null>(null);
  const [prices, setPrices] = useState<PriceRecord[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', brand: '', size: '', category: '' });
  const [newPrice, setNewPrice] = useState<number | null>(null);
  const [newStore, setNewStore] = useState<string | null>(state.settings.currentStoreId);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    if (!productId) return;
    const p = await getProduct(productId);
    setProduct(p ?? null);
    setPrices(await listPrices(productId));
    if (p) setDraft({ name: p.name, brand: p.brand, size: p.size, category: p.category });
  }, [productId]);

  useEffect(() => {
    setEditing(false);
    setShowHistory(false);
    setNewPrice(null);
    setNewStore(state.settings.currentStoreId);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, productsVersion]);

  if (!productId) return null;
  const comparison = buildComparison(prices, stores, state.settings.staleAfterDays);

  const saveMeta = async () => {
    if (!product || !draft.name.trim()) return;
    await upsertProduct({ ...product, ...draft });
    bumpProducts();
    setEditing(false);
    showToast('Produkt gespeichert');
  };

  const addPrice = async () => {
    if (!product || newPrice === null) return;
    await recordPrice(product.id, newStore, newPrice);
    setNewPrice(null);
    bumpProducts();
    showToast('Preis gespeichert');
  };

  const addToCart = (row: { storeId: string | null; priceCents: number }) => {
    if (!product) return;
    dispatch({
      type: 'addItem',
      item: {
        name: product.name,
        unitPriceCents: row.priceCents,
        quantity: 1,
        depositCents: 0,
        storeId: row.storeId,
        productId: product.id,
        barcode: product.barcode,
      },
    });
    showToast(`${product.name} · ${formatCents(row.priceCents)} hinzugefügt`);
  };

  const remove = async () => {
    if (!product) return;
    if (!window.confirm(`„${product.name}“ und alle gespeicherten Preise löschen?`)) return;
    await deleteProduct(product.id);
    bumpProducts();
    showToast('Produkt gelöscht');
    onClose();
  };

  return (
    <Sheet open={!!productId} onClose={onClose} title={product?.name || 'Produkt'} full>
      {!product ? (
        <p className="text-muted">Produkt nicht gefunden.</p>
      ) : (
        <>
          {!editing ? (
            <div className="rounded-2xl bg-card2 p-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[14px]">
                <Info label="Marke" value={product.brand} />
                <Info label="Größe" value={product.size} />
                <Info label="Kategorie" value={product.category} />
                <Info label="Barcode" value={product.barcode ?? ''} mono />
              </dl>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[12px] text-muted">
                  {product.source === 'openfoodfacts' ? 'Stammdaten: Open Food Facts' : 'Selbst erfasst'}
                </span>
                <Button size="sm" onClick={() => setEditing(true)}>
                  Bearbeiten
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {(['name', 'brand', 'size', 'category'] as const).map((f) => (
                <div key={f}>
                  <Label>{{ name: 'Name', brand: 'Marke', size: 'Größe (z. B. 1 l, 500 g)', category: 'Kategorie' }[f]}</Label>
                  <input
                    className={inputClass}
                    value={draft[f]}
                    maxLength={80}
                    onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))}
                  />
                </div>
              ))}
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => setEditing(false)}>
                  Abbrechen
                </Button>
                <Button variant="primary" className="flex-1" disabled={!draft.name.trim()} onClick={() => void saveMeta()}>
                  Speichern
                </Button>
              </div>
            </div>
          )}

          <h3 className="mb-2 mt-6 font-display text-[18px] font-bold">Preisvergleich</h3>
          <p className="mb-3 text-[12.5px] text-muted">
            Deine selbst erfassten Preise für {product.size ? `genau diese Packungsgröße (${product.size})` : 'genau dieses Produkt'} – reine
            Information, keine Empfehlung.
          </p>
          {comparison.length === 0 ? (
            <p className="rounded-2xl bg-card2 px-4 py-3 text-[14px] text-muted">Noch kein Preis gespeichert.</p>
          ) : (
            <ul className="divide-y divide-line/60 overflow-hidden rounded-2xl bg-card2">
              {comparison.map((row) => (
                <li key={row.storeId ?? 'none'} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-medium">{row.storeName}</div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                      {formatDate(row.recordedAt)} · {formatAge(row.recordedAt)}
                      {row.stale && <Badge tone="warn">möglicherweise veraltet</Badge>}
                    </div>
                  </div>
                  <div className="text-[18px] font-semibold tabular-nums">{formatCents(row.priceCents)}</div>
                  <Button size="sm" variant="ghost" onClick={() => addToCart(row)} aria-label={`Mit Preis von ${row.storeName} zum Einkauf hinzufügen`}>
                    + Einkauf
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 rounded-2xl border border-line/60 p-4">
            <Label>Preis erfassen</Label>
            <MoneyInput valueCents={newPrice} onChange={setNewPrice} onEnter={() => void addPrice()} />
            <div className="mt-3">
              <StorePicker value={newStore} onChange={setNewStore} />
            </div>
            <Button variant="primary" className="mt-3 w-full" disabled={newPrice === null} onClick={() => void addPrice()}>
              Preis speichern{newStore ? ` (${storeName(newStore)})` : ''}
            </Button>
          </div>

          {prices.length > 0 && (
            <div className="mt-5">
              <button type="button" className="tap text-[14px] font-semibold text-accent" onClick={() => setShowHistory((s) => !s)}>
                {showHistory ? 'Preisverlauf ausblenden' : `Preisverlauf anzeigen (${prices.length})`}
              </button>
              {showHistory && (
                <ul className="mt-2 divide-y divide-line/60 overflow-hidden rounded-2xl bg-card2">
                  {prices.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-[14px]">
                      <span className="flex-1">
                        {p.storeId ? storeName(p.storeId) : 'Ohne Markt'}
                        <span className="ml-2 text-muted">{formatDate(p.recordedAt)}</span>
                      </span>
                      <span className="tabular-nums">{formatCents(p.priceCents)}</span>
                      <button
                        type="button"
                        aria-label="Preis löschen"
                        className="tap p-1 text-muted"
                        onClick={async () => {
                          await deletePrice(p.id);
                          bumpProducts();
                        }}
                      >
                        <IconTrash size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <Button variant="danger" className="mb-2 mt-8 w-full" onClick={() => void remove()}>
            Produkt löschen
          </Button>
        </>
      )}
    </Sheet>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-muted">{label}</dt>
      <dd className={'truncate ' + (mono ? 'tabular-nums' : '')}>{value || '–'}</dd>
    </div>
  );
}
