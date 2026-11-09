import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './state/AppContext';
import { useOnline } from './state/useOnline';
import { ShopView } from './views/ShopView';
import { ProductsView } from './views/ProductsView';
import { SettingsView } from './views/SettingsView';
import { IconBox, IconCart, IconSettings, IconWifiOff } from './components/icons';
import { cx } from './components/ui';

type Tab = 'shop' | 'products' | 'settings';

function Shell() {
  const { state, toast, dismissToast, storageError } = useApp();
  const online = useOnline();
  const [tab, setTab] = useState<Tab>('shop');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  if (!state.ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" aria-label="Lädt" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <header className="sticky top-0 z-30 bg-bg/85 px-5 pb-2 pt-safe backdrop-blur-xl">
        <div className="flex h-12 items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            <span className="font-display text-[19px] font-bold tracking-tight">ShopCalc</span>
          </div>
          {!online && (
            <span
              role="status"
              className="flex items-center gap-1.5 rounded-full bg-warn/15 px-3 py-1 text-[12.5px] font-semibold text-warn"
              title="Keine Internetverbindung. Berechnungen und gespeicherte Produkte funktionieren weiter; neue Produktinfos aus dem Internet sind nicht verfügbar."
            >
              <IconWifiOff size={14} /> Offline
            </span>
          )}
        </div>
      </header>

      {storageError && tab === 'shop' && (
        <p className="mx-5 mb-3 rounded-2xl bg-warn/10 p-3 text-[13px] text-warn">{storageError}</p>
      )}

      <main className="flex-1 px-5 pb-[calc(96px+env(safe-area-inset-bottom))] pt-2">
        {tab === 'shop' && <ShopView />}
        {tab === 'products' && <ProductsView />}
        {tab === 'settings' && <SettingsView />}
      </main>

      {toast && (
        <div
          key={toast.id}
          role="status"
          className="fixed inset-x-0 z-[60] mx-auto flex w-[calc(100%-2.5rem)] max-w-md animate-pop items-center justify-between gap-3 rounded-2xl border border-line bg-card2/95 px-4 py-3 text-[14.5px] shadow-2xl backdrop-blur"
          style={{ top: 'calc(10px + env(safe-area-inset-top))' }}
        >
          <span className="min-w-0 truncate">{toast.message}</span>
          {toast.actionLabel && (
            <button
              type="button"
              className="tap shrink-0 font-semibold text-accent"
              onClick={() => {
                toast.onAction?.();
                dismissToast();
              }}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}

      <nav
        aria-label="Hauptnavigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line/60 bg-bg/90 pb-safe backdrop-blur-xl"
      >
        <div className="mx-auto grid h-[64px] max-w-xl grid-cols-3">
          <TabButton active={tab === 'shop'} onClick={() => setTab('shop')} icon={<IconCart />} label="Einkauf" />
          <TabButton active={tab === 'products'} onClick={() => setTab('products')} icon={<IconBox />} label="Produkte" />
          <TabButton active={tab === 'settings'} onClick={() => setTab('settings')} icon={<IconSettings />} label="Einstellungen" />
        </div>
      </nav>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cx('tap flex flex-col items-center justify-center gap-1 text-[11px] font-medium', active ? 'text-accent' : 'text-muted')}
    >
      {icon}
      {label}
    </button>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
