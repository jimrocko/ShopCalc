import { useCallback, useEffect, useState } from 'react';
import { Button, Chip, Label, MoneyInput, Sheet, inputClass } from './ui';
import { StorePicker } from './StorePicker';
import { useApp } from '../state/AppContext';
import { deletePrice, deleteProduct, getProduct, listPrices, recordPrice, upsertProduct } from '../db/repo';
import { buildComparison, formatDate } from '../lib/prices';
import { PriceRow } from './PriceRow';
import { FACTS_SOURCE_LABEL } from '../api/openFacts';
import { openPricesApplies } from '../api/openPrices';
import { refreshExternalPrices, resolveProduct } from '../services/scanLookup';
import { useOnline } from '../state/useOnline';
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
  const [estimated, setEstimated] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const online = useOnline();

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
    await recordPrice(product.id, newStore, newPrice, Date.now(), { estimated });
    setNewPrice(null);
    setEstimated(false);
    bumpProducts();
    showToast('Preis gespeichert');
  };

  const refreshOnline = async () => {
    if (!product?.barcode) return;
    setRefreshing(true);
    try {
      const res = await resolveProduct(product.barcode, { useFacts: state.settings.useOpenFoodFacts, force: true });
      const target = res.product ?? product;
      const pr = await refreshExternalPrices(target, { useOpenPrices: state.settings.useOpenPrices, stores });
      bumpProducts();
      showToast(
        pr.status === 'ok'
          ? `${pr.found} öffentliche Preise gefunden`
          : pr.status === 'skipped-not-food'
            ? 'Produktdaten aktualisiert (keine freie Preisquelle für diese Produktart)'
            : res.status === 'found'
              ? 'Produktdaten aktualisiert'
              : 'Keine neuen Daten gefunden',
      );
    } finally {
      setRefreshing(false);
    }
  };

  const addToCart = (row: { priceCents: number }) => {
    if (!product) return;
    dispatch({
      type: 'addItem',
      item: {
        name: product.name,
        unitPriceCents: row.priceCents,
        quantity: 1,
        depositCents: 0,
        storeId: state.settings.currentStoreId,
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
          {product.imageUrl && (
            <div className="mb-4 flex h-32 items-center justify-center overflow-hidden rounded-2xl bg-white">
              <img src={product.imageUrl} alt={product.name} className="h-full object-contain" />
            </div>
          )}
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
                  {product.source === 'user' ? 'Selbst erfasst' : `Stammdaten: ${FACTS_SOURCE_LABEL[product.source]}`}
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
            Preise für {product.size ? `genau diese Packungsgröße (${product.size})` : 'genau dieses Produkt'} mit Quelle und Datum – reine
            Information, keine Empfehlung.
          </p>
          {comparison.length === 0 ? (
            <p className="rounded-2xl bg-card2 px-4 py-3 text-[14px] text-muted">Noch kein Preis gespeichert.</p>
          ) : (
            <div className="divide-y divide-line/60 overflow-hidden rounded-2xl bg-card2">
              {comparison.map((row) => (
                <PriceRow
                  key={row.key}
                  row={row}
                  action={
                    <Button size="sm" variant="ghost" onClick={() => addToCart(row)} aria-label={`Mit Preis von ${row.storeName} zum Einkauf hinzufügen`}>
                      +
                    </Button>
                  }
                />
              ))}
            </div>
          )}

          {product.barcode && (
            <Button className="mt-3 w-full" disabled={!online || refreshing} onClick={() => void refreshOnline()}>
              {refreshing
                ? 'Aktualisiere …'
                : openPricesApplies(product.productType) || !product.productType
                  ? 'Produktdaten & öffentliche Preise aktualisieren'
                  : 'Produktdaten online aktualisieren'}
            </Button>
          )}

          <div className="mt-5 rounded-2xl border border-line/60 p-4">
            <Label>Preis erfassen</Label>
            <MoneyInput valueCents={newPrice} onChange={setNewPrice} onEnter={() => void addPrice()} />
            <div className="mt-3">
              <StorePicker value={newStore} onChange={setNewStore} />
            </div>
            <div className="mt-3">
              <Chip active={estimated} onClick={() => setEstimated((v) => !v)}>
                {estimated ? '✓ ' : ''}Nur geschätzt
              </Chip>
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
                        {p.source === 'manual' ? (p.storeId ? storeName(p.storeId) : 'Ohne Markt') : p.locationLabel ?? 'Open Prices'}
                        <span className="ml-2 text-muted">
                          {formatDate(p.recordedAt)} · {p.source === 'manual' ? (p.estimated ? 'geschätzt' : 'eigene Eingabe') : 'Open Prices'}
                        </span>
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
