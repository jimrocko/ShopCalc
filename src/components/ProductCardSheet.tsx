import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Chip, Label, MoneyInput, Sheet, inputClass } from './ui';
import { StorePicker } from './StorePicker';
import { PriceRow } from './PriceRow';
import { useApp } from '../state/AppContext';
import { useOnline } from '../state/useOnline';
import { formatCents } from '../lib/money';
import { buildComparison, formatDate } from '../lib/prices';
import type { PriceRecord, Product } from '../lib/types';
import { FACTS_SOURCE_LABEL } from '../api/openFacts';
import {
  externalFetchedAt,
  loadPrices,
  refreshExternalPrices,
  resolveProduct,
  saveManualPrice,
  suggestPrice,
  type PriceLookupStatus,
  type ProductLookupStatus,
} from '../services/scanLookup';
import type { ItemPrefill } from './ItemSheet';
import { IconBox } from './icons';

/**
 * Produktkarte nach einem Barcode-Scan: Bild, Name, Marke, Größe, gefundene Preise mit Quelle und Datum.
 * „Zum Einkauf hinzufügen“ bei vorhandenem Preis, sonst „Preis manuell eingeben“.
 */
export function ProductCardSheet({
  barcode,
  onClose,
  onMoreOptions,
}: {
  barcode: string | null;
  onClose: () => void;
  onMoreOptions: (prefill: ItemPrefill) => void;
}) {
  const { state, dispatch, stores, storeName, showToast, bumpProducts } = useApp();
  const { settings } = state;
  const online = useOnline();

  const [product, setProduct] = useState<Product | null>(null);
  const [productStatus, setProductStatus] = useState<ProductLookupStatus | 'loading'>('loading');
  const [prices, setPrices] = useState<PriceRecord[]>([]);
  const [priceStatus, setPriceStatus] = useState<PriceLookupStatus | 'loading' | 'idle'>('idle');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  // Formular „Preis manuell eingeben“
  const [price, setPrice] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [storeId, setStoreId] = useState<string | null>(settings.currentStoreId);
  const [estimated, setEstimated] = useState(false);
  const priceRef = useRef<HTMLInputElement>(null);
  const userSelected = useRef(false);

  const comparison = useMemo(
    () => buildComparison(prices, stores, settings.staleAfterDays),
    [prices, stores, settings.staleAfterDays],
  );

  const run = useCallback(
    async (code: string, cancelled: () => boolean) => {
      setProductStatus('loading');
      setPriceStatus('idle');
      // 1. Lokal (sofort)
      const quick = await resolveProduct(code, { useFacts: false });
      if (cancelled()) return;
      if (quick.product) {
        setProduct(quick.product);
        setPrices(await loadPrices(quick.product));
      }
      // 2. Produktdatenbanken
      const res = await resolveProduct(code, { useFacts: settings.useOpenFoodFacts });
      if (cancelled()) return;
      setProduct(res.product);
      setProductStatus(res.status);
      if (res.status === 'found') bumpProducts();
      if (!res.product) return;
      setPrices(await loadPrices(res.product));
      // 3. Öffentliche Preise (nur Lebensmittel)
      setPriceStatus('loading');
      const pr = await refreshExternalPrices(res.product, { useOpenPrices: settings.useOpenPrices, stores });
      if (cancelled()) return;
      setPriceStatus(pr.status);
      if (pr.found > 0) bumpProducts();
      setPrices(await loadPrices(res.product));
    },
    [settings.useOpenFoodFacts, settings.useOpenPrices, stores, bumpProducts],
  );

  useEffect(() => {
    if (!barcode) return;
    let cancelled = false;
    setProduct(null);
    setPrices([]);
    setSelectedKey(null);
    setManualOpen(false);
    setPrice(null);
    setName('');
    setEstimated(false);
    setStoreId(settings.currentStoreId);
    userSelected.current = false;
    run(barcode, () => cancelled).catch((e) => {
      console.error(e);
      if (!cancelled) setProductStatus('error');
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcode]);

  // Vorauswahl eines tatsächlich vorhandenen, aktuellen Preises
  useEffect(() => {
    if (userSelected.current) return;
    const s = suggestPrice(prices, settings.currentStoreId, settings.staleAfterDays);
    setSelectedKey(s ? comparison.find((r) => r.record.id === s.id)?.key ?? null : null);
  }, [prices, comparison, settings.currentStoreId, settings.staleAfterDays]);

  const selected = comparison.find((r) => r.key === selectedKey) ?? null;
  const loadingProduct = productStatus === 'loading' && !product;
  const unknown = !loadingProduct && !product;
  const displayName = product?.name || 'Unbekanntes Produkt';

  const openManual = () => {
    setManualOpen(true);
    // Fokus nach dem Rendern setzen (iOS öffnet die Tastatur nur bei Nutzerinteraktion)
    requestAnimationFrame(() => priceRef.current?.focus());
  };

  const addToCart = (priceCents: number, productId: string | null) => {
    dispatch({
      type: 'addItem',
      item: {
        name: (product?.name || name).trim(),
        unitPriceCents: priceCents,
        quantity: 1,
        depositCents: 0,
        // Position gehört zum Markt, in dem gerade eingekauft wird
        storeId: settings.currentStoreId,
        productId,
        barcode,
      },
    });
  };

  const addSelected = () => {
    if (!selected) return;
    addToCart(selected.priceCents, product?.id ?? null);
    showToast(`${displayName} · ${formatCents(selected.priceCents)} hinzugefügt`);
    onClose();
  };

  const saveManual = async (alsoAdd: boolean) => {
    if (price === null || !barcode) return;
    try {
      const pid = await saveManualPrice({ barcode, product, name, storeId, priceCents: price, estimated });
      bumpProducts();
      if (alsoAdd) {
        addToCart(price, pid);
        showToast(`Preis gespeichert · ${formatCents(price)} hinzugefügt`);
        onClose();
      } else {
        showToast('Preis gespeichert');
        setManualOpen(false);
        setPrice(null);
        userSelected.current = false;
        const fresh = await resolveProduct(barcode, { useFacts: false });
        setProduct(fresh.product);
        setPrices(await loadPrices(fresh.product));
      }
    } catch (e) {
      console.error(e);
      showToast('Speichern fehlgeschlagen');
    }
  };

  const moreOptions = () => {
    onMoreOptions({
      name: product?.name ?? name,
      barcode,
      productId: product?.id ?? null,
      brand: product?.brand,
      size: product?.size,
      category: product?.category,
      source: product?.source,
      imageUrl: product?.imageUrl,
      priceCents: manualOpen ? price : selected?.priceCents ?? null,
      priceInfo:
        !manualOpen && selected
          ? {
              storeId: selected.record.storeId,
              recordedAt: selected.recordedAt,
              label: selected.storeName,
              external: selected.record.source !== 'manual',
            }
          : null,
    });
  };

  const fetchedAt = externalFetchedAt(prices);

  return (
    <Sheet open={!!barcode} onClose={onClose} title="Produkt" full>
      {/* Produktkopf */}
      <div className="flex gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white">
          {product?.imageUrl ? (
            <img src={product.imageUrl} alt={displayName} className="h-full w-full object-contain" />
          ) : (
            <IconBox size={36} className="text-neutral-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {loadingProduct ? (
            <div className="space-y-2 pt-1" aria-label="Produkt wird gesucht">
              <div className="h-5 w-3/4 animate-pulse rounded bg-card2" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-card2" />
              <div className="text-[13px] text-muted">Suche Produkt …</div>
            </div>
          ) : (
            <>
              <h3 className="font-display text-[20px] font-bold leading-tight" data-testid="product-name">
                {displayName}
              </h3>
              {product?.brand && <div className="mt-0.5 truncate text-[15px] text-white/80">{product.brand}</div>}
              <div className="mt-0.5 text-[13px] text-muted">
                {[product?.size, product?.category].filter(Boolean).join(' · ')}
              </div>
              <div className="mt-1 text-[12px] tabular-nums text-muted">
                EAN {barcode}
                {product && ` · ${FACTS_SOURCE_LABEL[product.source]}`}
              </div>
            </>
          )}
        </div>
      </div>

      {unknown && (
        <p className="mt-4 rounded-2xl bg-card2 px-4 py-3 text-[14px] text-white/90">
          {productStatus === 'offline'
            ? 'Offline – das Produkt ist noch nicht lokal gespeichert. Du kannst den Preis trotzdem eingeben.'
            : productStatus === 'error'
              ? 'Produktdaten konnten nicht geladen werden. Du kannst den Preis trotzdem eingeben.'
              : productStatus === 'disabled'
                ? 'Produkt nicht lokal gespeichert (Online-Suche ist in den Einstellungen deaktiviert).'
                : 'Dieser Barcode ist in keiner der freien Produktdatenbanken bekannt.'}
        </p>
      )}

      {/* Preise */}
      {!loadingProduct && (
        <section className="mt-6" aria-label="Gefundene Preise">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="font-display text-[18px] font-bold">Preise</h3>
            {priceStatus === 'loading' && <span className="text-[12px] text-muted">Suche bei Open Prices …</span>}
          </div>

          {comparison.length > 0 ? (
            <div role="radiogroup" aria-label="Preis auswählen" className="divide-y divide-line/60 overflow-hidden rounded-2xl bg-card2">
              {comparison.map((row) => (
                <PriceRow
                  key={row.key}
                  row={row}
                  selected={row.key === selectedKey}
                  onSelect={() => {
                    userSelected.current = true;
                    setSelectedKey(row.key === selectedKey ? null : row.key);
                    setManualOpen(false);
                  }}
                />
              ))}
            </div>
          ) : (
            priceStatus !== 'loading' && (
              <p className="rounded-2xl bg-card2 px-4 py-3 text-[14px] text-white/90" data-testid="no-price">
                Kein Preis gefunden.
              </p>
            )
          )}

          <PriceSourceNote status={priceStatus} productType={product?.productType ?? null} online={online} fetchedAt={fetchedAt} />
          {comparison.length > 0 && !selected && !manualOpen && (
            <p className="mt-2 text-[12.5px] text-muted">
              Tippe einen Preis an, um ihn zu übernehmen. Ältere, geschätzte und Onlinepreise werden nicht automatisch gewählt.
            </p>
          )}
          {selected && selected.record.source !== 'manual' && (
            <p className="mt-2 text-[12.5px] text-warn">
              Preis einer anderen Person ({selected.storeName}, {formatDate(selected.recordedAt)}). Bitte mit dem Preisschild vor Ort vergleichen.
            </p>
          )}
        </section>
      )}

      {/* Manuelle Eingabe */}
      {manualOpen && (
        <section className="mt-5 rounded-2xl border border-line/60 p-4" aria-label="Preis manuell eingeben">
          <Label htmlFor="card-price" hint="vom Preisschild">
            Preis
          </Label>
          <MoneyInput id="card-price" inputRef={priceRef} valueCents={price} onChange={setPrice} large onEnter={() => void saveManual(true)} />
          {unknown && (
            <div className="mt-4">
              <Label htmlFor="card-name" hint="optional">
                Produktname
              </Label>
              <input
                id="card-name"
                className={inputClass}
                placeholder="z. B. Deo Spray 150 ml"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}
          <div className="mt-4">
            <Label hint="optional">Supermarkt</Label>
            <StorePicker value={storeId} onChange={setStoreId} />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Chip active={estimated} onClick={() => setEstimated((v) => !v)}>
              {estimated ? '✓ ' : ''}Nur geschätzt
            </Chip>
            <span className="text-[12px] text-muted">wird als „Geschätzt“ gekennzeichnet</span>
          </div>
        </section>
      )}

      {!loadingProduct && (
        <div className="mb-2 mt-5 flex flex-col gap-2">
          {manualOpen ? (
            <>
              <Button variant="primary" size="lg" disabled={price === null} onClick={() => void saveManual(true)}>
                Speichern & zum Einkauf hinzufügen
              </Button>
              <Button disabled={price === null} onClick={() => void saveManual(false)}>
                Nur Preis speichern
              </Button>
            </>
          ) : selected ? (
            <>
              <Button variant="primary" size="lg" onClick={addSelected}>
                Zum Einkauf hinzufügen · {formatCents(selected.priceCents)}
              </Button>
              <Button onClick={openManual}>Anderen Preis eingeben</Button>
            </>
          ) : (
            <Button variant="primary" size="lg" onClick={openManual}>
              Preis manuell eingeben
            </Button>
          )}
          <button type="button" className="tap mt-1 self-center text-[14px] font-semibold text-accent" onClick={moreOptions}>
            Menge, Pfand oder Markt anpassen …
          </button>
          {storeName(settings.currentStoreId) && (
            <p className="text-center text-[12px] text-muted">Wird dem aktuellen Markt {storeName(settings.currentStoreId)} zugeordnet.</p>
          )}
        </div>
      )}
    </Sheet>
  );
}

function PriceSourceNote({
  status,
  productType,
  online,
  fetchedAt,
}: {
  status: PriceLookupStatus | 'loading' | 'idle';
  productType: Product['productType'];
  online: boolean;
  fetchedAt: number | null;
}) {
  let text: string | null = null;
  if (status === 'skipped-not-food') {
    text =
      productType === 'beauty'
        ? 'Für Kosmetik und Körperpflege gibt es keine freie Preisdatenbank. Gezeigt werden nur deine eigenen Preise.'
        : 'Für diese Produktart gibt es keine freie Preisdatenbank. Gezeigt werden nur deine eigenen Preise.';
  } else if (status === 'offline' || (!online && status !== 'loading')) {
    text = fetchedAt
      ? `Offline – öffentliche Preise vom Stand ${formatDate(fetchedAt)}.`
      : 'Offline – öffentliche Preise können gerade nicht abgerufen werden.';
  } else if (status === 'error') {
    text = 'Open Prices ist gerade nicht erreichbar. Gezeigt werden gespeicherte Preise.';
  } else if (status === 'ok') {
    text = 'Öffentliche Preise: Open Prices (Open Food Facts, ODbL) – von Nutzern mit Preisschild oder Kassenbon erfasst.';
  } else if (status === 'disabled') {
    text = 'Abfrage öffentlicher Preise ist in den Einstellungen deaktiviert.';
  }
  return text ? <p className="mt-2 text-[12px] text-muted">{text}</p> : null;
}
