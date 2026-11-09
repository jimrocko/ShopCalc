import { useRef, useState } from 'react';
import { useApp } from '../state/AppContext';
import { Button, Card, Label, MoneyInput, Toggle, inputClass } from '../components/ui';
import { formatCents } from '../lib/money';
import { addStore, clearProductDatabase, deleteStore, exportAll, importAll, renameStore } from '../db/repo';
import { IconTrash } from '../components/icons';
import type { Settings } from '../lib/types';

export function SettingsView() {
  const { state, dispatch, stores, reloadStores, bumpProducts, showToast, storageError } = useApp();
  const { settings } = state;
  const [newStore, setNewStore] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<Omit<Settings, 'id'>>) => dispatch({ type: 'settings', patch });

  const doExport = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shopcalc-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const doImport = async (file: File) => {
    try {
      const res = await importAll(JSON.parse(await file.text()));
      await reloadStores();
      bumpProducts();
      showToast(`${res.products} Produkte und ${res.prices} Preise importiert`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Import fehlgeschlagen');
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-[30px] font-bold tracking-tight">Einstellungen</h1>

      {storageError && <p className="rounded-2xl bg-warn/10 p-3 text-[14px] text-warn">{storageError}</p>}

      <Card className="p-4">
        <Label>Budget</Label>
        <MoneyInput valueCents={settings.budgetCents} onChange={(c) => c !== null && set({ budgetCents: c })} />
        <div className="mt-4">
          <Label hint={formatCents(settings.defaultDepositCents)}>Standard-Pfand</Label>
          <MoneyInput valueCents={settings.defaultDepositCents} onChange={(c) => c !== null && set({ defaultDepositCents: c })} />
        </div>
        <div className="mt-4">
          <Label>Preis gilt als möglicherweise veraltet nach</Label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              className={inputClass + ' w-28 tabular-nums'}
              value={settings.staleAfterDays}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                if (Number.isFinite(n) && n >= 1 && n <= 365) set({ staleAfterDays: n });
              }}
            />
            <span className="text-muted">Tagen</span>
          </div>
        </div>
      </Card>

      <Card className="divide-y divide-line/50 px-4">
        <Toggle
          label="Gleiche Produkte zusammenfassen"
          description="Erhöht die Menge statt eine neue Zeile anzulegen."
          checked={settings.mergeDuplicates}
          onChange={(v) => set({ mergeDuplicates: v })}
        />
        <Toggle
          label="Preise merken"
          description="Erfasste Produkte und Preise lokal speichern."
          checked={settings.rememberPrices}
          onChange={(v) => set({ rememberPrices: v })}
        />
        <Toggle
          label="Open Food Facts verwenden"
          description="Produktname/Marke zu unbekannten Barcodes online nachschlagen (kostenlos, keine Preise)."
          checked={settings.useOpenFoodFacts}
          onChange={(v) => set({ useOpenFoodFacts: v })}
        />
      </Card>

      <Card className="p-4">
        <Label>Supermärkte</Label>
        <ul className="divide-y divide-line/50">
          {stores.map((s) => (
            <li key={s.id} className="flex items-center gap-2 py-2">
              {s.builtIn ? (
                <span className="flex-1 py-2 text-[16px]">{s.name}</span>
              ) : (
                <input
                  className="h-10 flex-1 bg-transparent text-[16px] outline-none"
                  defaultValue={s.name}
                  maxLength={40}
                  aria-label="Marktname"
                  onBlur={async (e) => {
                    if (e.target.value.trim() && e.target.value !== s.name) {
                      await renameStore(s.id, e.target.value);
                      await reloadStores();
                    }
                  }}
                />
              )}
              {!s.builtIn && (
                <button
                  type="button"
                  aria-label={`${s.name} entfernen`}
                  className="tap p-2 text-muted"
                  onClick={async () => {
                    if (!window.confirm(`Markt „${s.name}“ entfernen? Gespeicherte Preise bleiben erhalten.`)) return;
                    await deleteStore(s.id);
                    if (settings.currentStoreId === s.id) set({ currentStoreId: null });
                    await reloadStores();
                  }}
                >
                  <IconTrash size={18} />
                </button>
              )}
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newStore.trim()) return;
            await addStore(newStore);
            setNewStore('');
            await reloadStores();
          }}
        >
          <input className={inputClass} placeholder="Weiteren Markt hinzufügen" value={newStore} maxLength={40} onChange={(e) => setNewStore(e.target.value)} />
          <Button type="submit" variant="primary" disabled={!newStore.trim()}>
            Hinzufügen
          </Button>
        </form>
      </Card>

      <Card className="p-4">
        <Label>Daten</Label>
        <p className="mb-3 text-[13px] text-muted">
          Alle Daten bleiben auf diesem Gerät. Keine Registrierung, keine Cloud. Mit einer Sicherungsdatei kannst du Produkte und Preise auf ein anderes Gerät übertragen.
        </p>
        <div className="flex flex-col gap-2">
          <Button onClick={() => void doExport()}>Sicherung exportieren</Button>
          <Button onClick={() => fileRef.current?.click()}>Sicherung importieren</Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void doImport(f);
              e.target.value = '';
            }}
          />
          <Button
            variant="danger"
            onClick={async () => {
              if (!window.confirm('Alle gespeicherten Produkte und Preise löschen? Dies kann nicht rückgängig gemacht werden.')) return;
              await clearProductDatabase();
              bumpProducts();
              showToast('Produktdatenbank geleert');
            }}
          >
            Produktdatenbank leeren
          </Button>
        </div>
      </Card>

      <Card className="p-4 text-[13px] leading-relaxed text-muted">
        <p className="font-semibold text-white">Über ShopCalc</p>
        <p className="mt-1">
          ShopCalc ist ein Einkaufsrechner – keine Einkaufsliste und keine Kaufempfehlung. Ein Barcode enthält keinen Preis:
          Angezeigte Preise sind immer deine eigenen, mit Datum gespeicherten Eingaben und können veraltet sein.
        </p>
        <p className="mt-2">
          Produktdaten: <a className="text-accent underline" href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a> (ODbL).
          Barcode-Erkennung: ZXing (Apache-2.0).
        </p>
        <p className="mt-2">Installation auf dem iPhone: In Safari „Teilen“ › „Zum Home-Bildschirm“.</p>
        <p className="mt-2">Version {__APP_VERSION__}</p>
      </Card>
    </div>
  );
}
