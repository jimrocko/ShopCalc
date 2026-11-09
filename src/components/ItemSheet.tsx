import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Chip, Label, MoneyInput, Sheet, Stepper, inputClass } from './ui';
import { StorePicker } from './StorePicker';
import { useApp } from '../state/AppContext';
import { formatCents, multiply } from '../lib/money';
import type { CartItem, PriceRecord, Product } from '../lib/types';
import { listAllPrices, listProducts } from '../db/repo';
import { rememberProductPrice } from '../db/remember';
import { bestKnownPrice, formatAge, formatDate, isStale } from '../lib/prices';
import { IconClock, IconTrash } from './icons';
import { uid } from '../lib/id';

export interface ItemPrefill {
  name?: string;
  barcode?: string | null;
  productId?: string | null;
  brand?: string;
  size?: string;
  category?: string;
  source?: Product['source'];
  priceCents?: number | null;
  /** Herkunft des vorausgefüllten Preises (für Transparenz) */
  priceInfo?: { storeId: string | null; recordedAt: number } | null;
  imageUrl?: string | null;
  note?: string;
}

const DEPOSIT_PRESETS = [8, 15, 25];

export function ItemSheet({
  open,
  onClose,
  editItem,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  editItem?: CartItem | null;
  prefill?: ItemPrefill | null;
}) {
  const { state, dispatch, showToast, storeName, productsVersion, bumpProducts } = useApp();
  const { settings } = state;

  const [price, setPrice] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [name, setName] = useState('');
  const [deposit, setDeposit] = useState(0);
  const [customDeposit, setCustomDeposit] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(settings.currentStoreId);
  const [productId, setProductId] = useState<string | null>(null);
  const [barcode, setBarcode] = useState<string | null>(null);
  const [meta, setMeta] = useState<Pick<ItemPrefill, 'brand' | 'size' | 'category' | 'source'>>({});
  const [priceInfo, setPriceInfo] = useState<ItemPrefill['priceInfo']>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [prices, setPrices] = useState<PriceRecord[]>([]);
  const priceRef = useRef<HTMLInputElement>(null);

  const isEdit = !!editItem;

  // Formular initialisieren
  useEffect(() => {
    if (!open) return;
    if (editItem) {
      setPrice(editItem.unitPriceCents);
      setQty(editItem.quantity);
      setName(editItem.name);
      setDeposit(editItem.depositCents);
      setCustomDeposit(editItem.depositCents > 0 && !DEPOSIT_PRESETS.includes(editItem.depositCents));
      setStoreId(editItem.storeId);
      setProductId(editItem.productId);
      setBarcode(editItem.barcode);
      setMeta({});
      setPriceInfo(null);
    } else {
      setPrice(prefill?.priceCents ?? null);
      setQty(1);
      setName(prefill?.name ?? '');
      setDeposit(0);
      setCustomDeposit(false);
      setStoreId(settings.currentStoreId);
      setProductId(prefill?.productId ?? null);
      setBarcode(prefill?.barcode ?? null);
      setMeta({ brand: prefill?.brand, size: prefill?.size, category: prefill?.category, source: prefill?.source });
      setPriceInfo(prefill?.priceInfo ?? null);
    }
    setShowSuggestions(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editItem, prefill]);

  // Produkte für Vorschläge laden
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([listProducts(), listAllPrices()])
      .then(([p, pr]) => {
        if (!cancelled) {
          setProducts(p);
          setPrices(pr);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, productsVersion]);

  const pricesByProduct = useMemo(() => {
    const m = new Map<string, PriceRecord[]>();
    for (const p of prices) {
      const arr = m.get(p.productId) ?? [];
      arr.push(p);
      m.set(p.productId, arr);
    }
    return m;
  }, [prices]);

  const suggestions = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (!q || !showSuggestions) return [];
    return products
      .filter((p) => `${p.name} ${p.brand}`.toLowerCase().includes(q) && p.id !== productId)
      .slice(0, 6)
      .map((p) => ({ product: p, price: bestKnownPrice(pricesByProduct.get(p.id) ?? [], storeId) }));
  }, [name, products, pricesByProduct, storeId, showSuggestions, productId]);

  const pickProduct = (p: Product, known: PriceRecord | null) => {
    setName(p.name);
    setProductId(p.id);
    setBarcode(p.barcode);
    setMeta({ brand: p.brand, size: p.size, category: p.category, source: p.source });
    setShowSuggestions(false);
    if (known) {
      setPrice(known.priceCents);
      setPriceInfo({ storeId: known.storeId, recordedAt: known.recordedAt });
    }
    priceRef.current?.focus();
  };

  const lineTotal = price !== null ? multiply(price, qty) + multiply(deposit, qty) : 0;

  const resetForm = () => {
    setPrice(null);
    setQty(1);
    setName('');
    setDeposit(0);
    setCustomDeposit(false);
    setProductId(null);
    setBarcode(null);
    setMeta({});
    setPriceInfo(null);
  };

  const submit = (keepOpen: boolean) => {
    if (price === null) {
      priceRef.current?.focus();
      return;
    }
    // Werte sichern und Formular sofort freigeben – das Speichern läuft im Hintergrund,
    // damit schnelles Weiter-Tippen nicht verloren geht.
    const trimmed = name.trim();
    const snapshot = { productId, barcode, meta, storeId, price, qty, deposit };
    const payload = {
      name: trimmed,
      unitPriceCents: price,
      quantity: qty,
      depositCents: deposit,
      storeId,
      productId,
      barcode,
    };

    let targetId: string;
    if (isEdit && editItem) {
      targetId = editItem.id;
      dispatch({ type: 'updateItem', id: editItem.id, patch: payload });
      showToast('Position aktualisiert');
      onClose();
    } else {
      targetId = uid();
      dispatch({ type: 'addItem', item: payload, id: targetId });
      if (storeId !== settings.currentStoreId) dispatch({ type: 'settings', patch: { currentStoreId: storeId } });
      showToast(`${trimmed || 'Artikel'} · ${formatCents(lineTotal)} hinzugefügt`);
      if (keepOpen) {
        resetForm();
        priceRef.current?.focus();
      } else {
        onClose();
      }
    }

    if (settings.rememberPrices && (trimmed || snapshot.barcode)) {
      rememberProductPrice({
        productId: snapshot.productId,
        barcode: snapshot.barcode,
        name: trimmed,
        brand: snapshot.meta.brand,
        size: snapshot.meta.size,
        category: snapshot.meta.category,
        source: snapshot.meta.source,
        storeId: snapshot.storeId,
        priceCents: snapshot.price,
      })
        .then((pid) => {
          bumpProducts();
          // Produkt-ID nachtragen (nur wenn die Position nicht in eine bestehende zusammengeführt wurde)
          if (pid && pid !== snapshot.productId) dispatch({ type: 'linkProduct', id: targetId, productId: pid });
        })
        .catch((e) => console.error('Preis speichern fehlgeschlagen', e));
    }
  };

  const remove = () => {
    if (!editItem) return;
    const snapshot = state.session;
    dispatch({ type: 'removeItem', id: editItem.id });
    showToast('Position entfernt', { label: 'Rückgängig', onAction: () => dispatch({ type: 'restoreSession', session: snapshot }) });
    onClose();
  };

  const staleInfo = priceInfo ? isStale(priceInfo.recordedAt, settings.staleAfterDays) : false;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEdit ? 'Position bearbeiten' : 'Preis eingeben'}
      footer={
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between px-1 text-[15px]">
            <span className="text-muted">Summe dieser Position</span>
            <span className="text-[20px] font-bold tabular-nums">{formatCents(lineTotal)}</span>
          </div>
          {isEdit ? (
            <div className="flex gap-2">
              <Button variant="danger" size="lg" onClick={remove} aria-label="Position entfernen">
                <IconTrash size={20} />
              </Button>
              <Button variant="primary" size="lg" className="flex-1" disabled={price === null} onClick={() => submit(false)}>
                Speichern
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="lg" className="flex-1" disabled={price === null} onClick={() => submit(true)}>
                + Nächstes
              </Button>
              <Button variant="primary" size="lg" className="flex-[1.4]" disabled={price === null} onClick={() => submit(false)}>
                Hinzufügen
              </Button>
            </div>
          )}
        </div>
      }
    >
      {prefill?.note && !isEdit && (
        <div className="mb-4 rounded-2xl bg-card2 px-4 py-3 text-[14px] text-white/90">{prefill.note}</div>
      )}
      {(meta.brand || meta.size || barcode) && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-card2 p-3">
          {prefill?.imageUrl && !isEdit && (
            <img src={prefill.imageUrl} alt="" className="h-12 w-12 rounded-xl bg-white object-contain" loading="lazy" />
          )}
          <div className="min-w-0 text-[13px] text-muted">
            {meta.brand && <div className="truncate text-white/90">{meta.brand}</div>}
            <div className="truncate">
              {[meta.size, meta.category].filter(Boolean).join(' · ')}
              {barcode && <span className="ml-1 tabular-nums">EAN {barcode}</span>}
            </div>
          </div>
        </div>
      )}

      <Label htmlFor="item-price" hint="Einzelpreis">
        Preis
      </Label>
      <MoneyInput
        id="item-price"
        inputRef={priceRef}
        valueCents={price}
        onChange={(c) => {
          setPrice(c);
          setPriceInfo(null);
        }}
        large
        autoFocus={!isEdit}
        onEnter={() => submit(false)}
      />
      {priceInfo && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted">
          <IconClock size={14} />
          <span>
            Gespeicherter Preis{priceInfo.storeId ? ` bei ${storeName(priceInfo.storeId)}` : ''} vom {formatDate(priceInfo.recordedAt)} (
            {formatAge(priceInfo.recordedAt)})
          </span>
          {staleInfo && <Badge tone="warn">möglicherweise veraltet</Badge>}
          <span className="w-full text-[12px]">Bitte mit dem Preisschild vergleichen und ggf. anpassen.</span>
        </div>
      )}

      <div className="mt-5">
        <Label>Menge</Label>
        <Stepper value={qty} onChange={setQty} />
      </div>

      <div className="relative mt-5">
        <Label htmlFor="item-name" hint="optional">
          Produkt
        </Label>
        <input
          id="item-name"
          className={inputClass}
          placeholder="z. B. Milch"
          value={name}
          autoComplete="off"
          autoCapitalize="sentences"
          maxLength={80}
          enterKeyHint="done"
          onChange={(e) => {
            setName(e.target.value);
            setShowSuggestions(true);
            if (productId) {
              setProductId(null);
              setBarcode(isEdit ? barcode : prefill?.barcode ?? null);
            }
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => window.setTimeout(() => setShowSuggestions(false), 150)}
        />
        {suggestions.length > 0 && (
          <ul className="absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded-2xl border border-line bg-card2 shadow-2xl" role="listbox">
            {suggestions.map(({ product, price: known }) => (
              <li key={product.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="tap flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-line"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickProduct(product, known)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[15px]">{product.name}</span>
                    <span className="block truncate text-[12px] text-muted">
                      {[product.brand, product.size].filter(Boolean).join(' · ') || 'Gespeichertes Produkt'}
                    </span>
                  </span>
                  {known && (
                    <span className="shrink-0 text-right">
                      <span className="block text-[15px] font-semibold tabular-nums">{formatCents(known.priceCents)}</span>
                      <span className="block text-[11px] text-muted">
                        {known.storeId ? storeName(known.storeId) : ''} {formatAge(known.recordedAt)}
                      </span>
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5">
        <Label hint={deposit > 0 ? `${formatCents(deposit)} je Stück` : undefined}>Pfand</Label>
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
          <Chip
            active={deposit === 0 && !customDeposit}
            onClick={() => {
              setDeposit(0);
              setCustomDeposit(false);
            }}
          >
            Kein Pfand
          </Chip>
          {DEPOSIT_PRESETS.map((d) => (
            <Chip
              key={d}
              active={!customDeposit && deposit === d}
              onClick={() => {
                setDeposit(d);
                setCustomDeposit(false);
              }}
            >
              {formatCents(d)}
            </Chip>
          ))}
          <Chip active={customDeposit} onClick={() => setCustomDeposit(true)}>
            Anderer
          </Chip>
        </div>
        {customDeposit && (
          <div className="mt-2">
            <MoneyInput valueCents={deposit || null} onChange={(c) => setDeposit(c ?? 0)} placeholder="Pfand je Stück" />
          </div>
        )}
      </div>

      <div className="mt-5">
        <Label hint="optional">Supermarkt</Label>
        <StorePicker value={storeId} onChange={setStoreId} />
      </div>

      {!settings.rememberPrices && (
        <p className="mt-4 text-[12px] text-muted">Preise werden nicht gespeichert (siehe Einstellungen).</p>
      )}
    </Sheet>
  );
}
