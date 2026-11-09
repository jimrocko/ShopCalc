import { useCallback, useState } from 'react';
import { BudgetCard } from '../components/BudgetCard';
import { BudgetSheet } from '../components/BudgetSheet';
import { ItemSheet, type ItemPrefill } from '../components/ItemSheet';
import { ScannerSheet } from '../components/ScannerSheet';
import { ProductCardSheet } from '../components/ProductCardSheet';
import { CalculatorSheet } from '../components/CalculatorSheet';
import { DepositSheet } from '../components/DepositSheet';
import { ItemList } from '../components/ItemList';
import { useApp } from '../state/AppContext';
import type { CartItem } from '../lib/types';
import { IconBarcode, IconBottle, IconCalculator, IconEuro, IconStore, IconChevronDown } from '../components/icons';
import { Sheet, cx } from '../components/ui';
import { StorePicker } from '../components/StorePicker';

type Open = null | 'item' | 'scan' | 'card' | 'calc' | 'deposit' | 'budget' | 'store';

export function ShopView() {
  const { state, dispatch, showToast, storeName } = useApp();
  const [open, setOpen] = useState<Open>(null);
  const [editItem, setEditItem] = useState<CartItem | null>(null);
  const [prefill, setPrefill] = useState<ItemPrefill | null>(null);
  const [scanned, setScanned] = useState<string | null>(null);

  const close = useCallback(() => {
    setOpen(null);
    setEditItem(null);
    setPrefill(null);
    setScanned(null);
  }, []);

  const onDetected = useCallback((code: string) => {
    setScanned(code);
    setOpen('card');
  }, []);

  const onMoreOptions = useCallback((p: ItemPrefill) => {
    setPrefill(p);
    setEditItem(null);
    setScanned(null);
    setOpen('item');
  }, []);

  const hasEntries = state.session.items.length > 0 || state.session.deposits.length > 0;

  const newPurchase = () => {
    const snapshot = state.session;
    dispatch({ type: 'newSession' });
    showToast('Neuer Einkauf gestartet', {
      label: 'Rückgängig',
      onAction: () => dispatch({ type: 'restoreSession', session: snapshot }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => setOpen('store')}
        className="tap -mb-1 flex items-center gap-1.5 self-start rounded-full bg-card2 px-3 py-1.5 text-[13px] font-medium text-white/90"
      >
        <IconStore size={15} />
        {state.settings.currentStoreId ? storeName(state.settings.currentStoreId) : 'Markt wählen'}
        <IconChevronDown size={14} className="text-muted" />
      </button>

      <BudgetCard onEditBudget={() => setOpen('budget')} />

      <div className="grid grid-cols-3 gap-3">
        <Action label="Preis eingeben" icon={<IconEuro size={26} />} primary onClick={() => setOpen('item')} />
        <Action label="Barcode scannen" icon={<IconBarcode size={26} />} onClick={() => setOpen('scan')} />
        <Action label="Taschen­rechner" icon={<IconCalculator size={26} />} onClick={() => setOpen('calc')} />
      </div>

      <div className="mt-2 flex items-center justify-between">
        <h2 className="font-display text-[20px] font-bold tracking-tight">Aktueller Einkauf</h2>
        <div className="flex gap-1">
          <button
            type="button"
            className="tap flex items-center gap-1 rounded-full px-3 py-1.5 text-[14px] font-semibold text-accent active:bg-card2"
            onClick={() => setOpen('deposit')}
          >
            <IconBottle size={16} /> Pfand
          </button>
          {hasEntries && (
            <button
              type="button"
              className="tap rounded-full px-3 py-1.5 text-[14px] font-semibold text-accent active:bg-card2"
              onClick={newPurchase}
            >
              Neu
            </button>
          )}
        </div>
      </div>
      <p className="-mt-3 text-[12.5px] text-muted">Temporäre Berechnung – keine Einkaufsliste. Tippen zum Bearbeiten.</p>

      <ItemList
        onEdit={(item) => {
          setEditItem(item);
          setPrefill(null);
          setOpen('item');
        }}
        onOpenDeposit={() => setOpen('deposit')}
      />

      {!state.settings.mergeDuplicates && state.session.items.length > 1 && (
        <button
          type="button"
          className="tap self-center text-[14px] font-semibold text-accent"
          onClick={() => dispatch({ type: 'mergeAll' })}
        >
          Gleiche Positionen zusammenfassen
        </button>
      )}

      <ItemSheet open={open === 'item'} onClose={close} editItem={editItem} prefill={prefill} />
      <ScannerSheet
        open={open === 'scan'}
        onClose={close}
        onDetected={onDetected}
        onManual={() => {
          setPrefill(null);
          setOpen('item');
        }}
      />
      <ProductCardSheet barcode={open === 'card' ? scanned : null} onClose={close} onMoreOptions={onMoreOptions} />
      <CalculatorSheet open={open === 'calc'} onClose={close} />
      <DepositSheet open={open === 'deposit'} onClose={close} />
      <BudgetSheet open={open === 'budget'} onClose={close} />
      <Sheet open={open === 'store'} onClose={close} title="Aktueller Markt">
        <p className="mb-3 text-[14px] text-muted">
          Neue Positionen werden diesem Markt zugeordnet. So werden Preise pro Markt gespeichert.
        </p>
        <StorePicker
          value={state.settings.currentStoreId}
          onChange={(id) => {
            dispatch({ type: 'settings', patch: { currentStoreId: id } });
            close();
          }}
        />
      </Sheet>
    </div>
  );
}

function Action({
  label,
  icon,
  onClick,
  primary,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'tap flex h-[104px] flex-col items-center justify-center gap-2 rounded-3xl border px-2 text-center text-[14px] font-semibold leading-tight transition-colors',
        primary
          ? 'border-accent/0 bg-accent text-black active:bg-emerald-300'
          : 'border-line/50 bg-card text-white active:bg-card2',
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
