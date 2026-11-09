import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { initialState, reducer, type Action, type AppState } from './reducer';
import { computeBudget, type BudgetStatus } from '../lib/cart';
import * as repo from '../db/repo';
import { requestPersistence } from '../db/db';
import type { Store } from '../lib/types';

interface Toast {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface Ctx {
  state: AppState;
  dispatch: (a: Action) => void;
  budget: BudgetStatus;
  stores: Store[];
  reloadStores: () => Promise<void>;
  storeName: (id: string | null) => string;
  /** Wird erhöht, wenn sich die Produktdatenbank ändert */
  productsVersion: number;
  bumpProducts: () => void;
  toast: Toast | null;
  showToast: (message: string, action?: { label: string; onAction: () => void }) => void;
  dismissToast: () => void;
  storageError: string | null;
}

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [stores, setStores] = useState<Store[]>([]);
  const [productsVersion, setProductsVersion] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const reloadStores = useCallback(async () => {
    setStores(await repo.listStores());
  }, []);

  // Laden
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [session, settings] = await Promise.all([repo.loadSession(), repo.loadSettings()]);
        // Doppelte Produkte (gleiche GTIN/EAN) zusammenführen – z. B. nach Importen
        await repo.mergeDuplicateProducts().catch((e) => console.error(e));
        await reloadStores();
        if (!cancelled) dispatch({ type: 'loaded', session, settings });
        void requestPersistence();
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setStorageError(
            'Der lokale Speicher ist nicht verfügbar (z. B. im privaten Modus). Die App funktioniert, Daten werden aber nicht dauerhaft gespeichert.',
          );
          dispatch({ type: 'loaded', session: initialState.session, settings: initialState.settings });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadStores]);

  // Speichern (nach dem Laden bei jeder Änderung)
  useEffect(() => {
    if (!state.ready || storageError) return;
    repo.saveSession(state.session).catch((e) => console.error('Sitzung speichern fehlgeschlagen', e));
  }, [state.ready, state.session, storageError]);

  useEffect(() => {
    if (!state.ready || storageError) return;
    repo.saveSettings(state.settings).catch((e) => console.error('Einstellungen speichern fehlgeschlagen', e));
  }, [state.ready, state.settings, storageError]);

  const budget = useMemo(
    () => computeBudget(state.session, state.settings.budgetCents),
    [state.session, state.settings.budgetCents],
  );

  const storeName = useCallback(
    (id: string | null) => (id ? stores.find((s) => s.id === id)?.name ?? 'Unbekannter Markt' : ''),
    [stores],
  );

  const dismissToast = useCallback(() => {
    window.clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  const showToast = useCallback((message: string, action?: { label: string; onAction: () => void }) => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, actionLabel: action?.label, onAction: action?.onAction });
    toastTimer.current = window.setTimeout(() => setToast(null), action ? 5000 : 2200);
  }, []);

  const value: Ctx = {
    state,
    dispatch,
    budget,
    stores,
    reloadStores,
    storeName,
    productsVersion,
    bumpProducts: useCallback(() => setProductsVersion((v) => v + 1), []),
    toast,
    showToast,
    dismissToast,
    storageError,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp außerhalb des AppProviders');
  return ctx;
}
