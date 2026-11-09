import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Sheet, inputClass } from './ui';
import { startScanner, ScannerError, cameraAvailable, describeScannerError, type ScannerHandle } from '../scanner/scanner';
import { findProductByBarcode, listPrices, upsertProduct } from '../db/repo';
import { lookupBarcode } from '../api/openFoodFacts';
import { bestKnownPrice } from '../lib/prices';
import { isSupportedBarcode, normalizeBarcode } from '../lib/barcode';
import { useApp } from '../state/AppContext';
import { useOnline } from '../state/useOnline';
import type { ItemPrefill } from './ItemSheet';
import { IconBolt } from './icons';

type Phase =
  | { kind: 'scanning' }
  | { kind: 'error'; message: string }
  | { kind: 'looking-up'; code: string };

/**
 * Barcode scannen → lokale Datenbank → (optional) Open Food Facts → Eingabemaske mit Vorbelegung.
 * Ein Preis wird nur vorgeschlagen, wenn der Nutzer ihn selbst zuvor gespeichert hat.
 */
export function ScannerSheet({
  open,
  onClose,
  onResult,
  onManual,
}: {
  open: boolean;
  onClose: () => void;
  onResult: (prefill: ItemPrefill) => void;
  onManual: () => void;
}) {
  const { state, bumpProducts } = useApp();
  const online = useOnline();
  const videoRef = useRef<HTMLVideoElement>(null);
  const handleRef = useRef<ScannerHandle | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'scanning' });
  const [manualCode, setManualCode] = useState('');
  const [torch, setTorch] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  const stop = useCallback(() => {
    handleRef.current?.stop();
    handleRef.current = null;
    setTorch(false);
  }, []);

  const resolveCode = useCallback(
    async (raw: string) => {
      const code = normalizeBarcode(raw);
      stop();
      if (navigator.vibrate) navigator.vibrate(40);
      setPhase({ kind: 'looking-up', code });

      const storeId = state.settings.currentStoreId;
      try {
        const local = await findProductByBarcode(code);
        if (local) {
          const known = bestKnownPrice(await listPrices(local.id), storeId);
          onResult({
            name: local.name,
            barcode: code,
            productId: local.id,
            brand: local.brand,
            size: local.size,
            category: local.category,
            source: local.source,
            priceCents: known?.priceCents ?? null,
            priceInfo: known ? { storeId: known.storeId, recordedAt: known.recordedAt } : null,
            note: known ? undefined : 'Produkt bekannt, aber noch kein Preis gespeichert. Bitte Preis eingeben.',
          });
          return;
        }
      } catch (e) {
        console.error(e);
      }

      if (!state.settings.useOpenFoodFacts) {
        onResult({ barcode: code, note: 'Unbekanntes Produkt – bitte Name (optional) und Preis eingeben.' });
        return;
      }

      const res = await lookupBarcode(code);
      if (res.status === 'found') {
        // Stammdaten lokal merken, damit sie künftig offline verfügbar sind
        try {
          const saved = await upsertProduct({ ...res.product, barcode: code, source: 'openfoodfacts' });
          bumpProducts();
          onResult({
            ...res.product,
            productId: saved.id,
            barcode: code,
            source: 'openfoodfacts',
            priceCents: null,
            note: 'Produktdaten von Open Food Facts. Ein Barcode enthält keinen Preis – bitte Preis vom Preisschild eingeben.',
          });
        } catch {
          onResult({ ...res.product, barcode: code, source: 'openfoodfacts', priceCents: null });
        }
        return;
      }
      const note =
        res.status === 'offline'
          ? 'Offline – Produktdaten können nicht abgerufen werden. Bitte Name (optional) und Preis eingeben.'
          : res.status === 'not-found'
            ? 'Produkt nicht gefunden. Bitte Name (optional) und Preis eingeben.'
            : 'Produktdaten konnten nicht geladen werden. Bitte Name (optional) und Preis eingeben.';
      onResult({ barcode: code, note });
    },
    [stop, state.settings.currentStoreId, state.settings.useOpenFoodFacts, onResult, bumpProducts],
  );

  useEffect(() => {
    if (!open) return;
    setPhase({ kind: 'scanning' });
    setManualCode('');
    const avail = cameraAvailable();
    if (!avail.ok) {
      setPhase({ kind: 'error', message: describeScannerError(avail.kind) });
      return;
    }
    let cancelled = false;
    const video = videoRef.current;
    if (!video) return;
    startScanner(video, (code) => void resolveCode(code))
      .then((h) => {
        if (cancelled) h.stop();
        else {
          handleRef.current = h;
          setTorchAvailable(!!h.setTorch);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setPhase({ kind: 'error', message: e instanceof ScannerError ? e.message : describeScannerError('unknown') });
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, resolveCode, stop]);

  const manualValid = isSupportedBarcode(manualCode);

  return (
    <Sheet open={open} onClose={onClose} title="Barcode scannen" full>
      <div className="relative h-[min(46dvh,420px)] w-full overflow-hidden rounded-3xl bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
        {phase.kind === 'scanning' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-[38%] w-[82%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
              <div className="scanline absolute left-3 right-3 h-0.5 bg-accent shadow-[0_0_12px_2px_rgba(52,211,153,0.7)]" />
            </div>
          </div>
        )}
        {phase.kind === 'looking-up' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-accent" />
            <div className="text-[15px]">Suche Produkt …</div>
            <div className="text-[13px] tabular-nums text-muted">EAN {phase.code}</div>
          </div>
        )}
        {phase.kind === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-card2 p-6 text-center text-[15px] text-white/90">
            {phase.message}
          </div>
        )}
        {torchAvailable && phase.kind === 'scanning' && (
          <button
            type="button"
            aria-label="Taschenlampe"
            aria-pressed={torch}
            className="tap absolute bottom-4 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white"
            onClick={async () => {
              const next = !torch;
              try {
                await handleRef.current?.setTorch?.(next);
                setTorch(next);
              } catch {
                setTorchAvailable(false);
              }
            }}
          >
            <IconBolt size={20} className={torch ? 'text-warn' : undefined} />
          </button>
        )}
      </div>

      <p className="mt-3 text-center text-[13px] text-muted">
        EAN-8 / EAN-13 in den Rahmen halten. Die Erkennung läuft lokal auf dem Gerät.
        {!online && ' Offline: Nur lokal gespeicherte Produkte werden erkannt.'}
      </p>

      <div className="mt-5">
        <div className="mb-1.5 text-[13px] font-medium uppercase tracking-wide text-muted">Barcode manuell eingeben</div>
        <div className="flex gap-2">
          <input
            className={inputClass + ' tabular-nums'}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="z. B. 4000417025005"
            value={manualCode}
            maxLength={13}
            onChange={(e) => setManualCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && manualValid) void resolveCode(manualCode);
            }}
          />
          <Button variant="primary" disabled={!manualValid} onClick={() => void resolveCode(manualCode)}>
            Suchen
          </Button>
        </div>
        {manualCode.length >= 8 && !manualValid && (
          <p className="mt-1.5 text-[12px] text-danger">Ungültiger EAN-Code (Prüfziffer stimmt nicht).</p>
        )}
      </div>

      <Button className="mt-4 w-full" onClick={onManual}>
        Ohne Barcode – Preis direkt eingeben
      </Button>
    </Sheet>
  );
}
