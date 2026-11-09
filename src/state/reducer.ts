import { addItem, mergeAll, sanitizeQuantity, type NewItem } from '../lib/cart';
import { uid } from '../lib/id';
import {
  DEFAULT_SETTINGS,
  emptySession,
  type CartItem,
  type DepositEntry,
  type Session,
  type Settings,
} from '../lib/types';

export interface AppState {
  ready: boolean;
  session: Session;
  settings: Settings;
}

export const initialState: AppState = {
  ready: false,
  session: emptySession(0),
  settings: DEFAULT_SETTINGS,
};

export type Action =
  | { type: 'loaded'; session: Session; settings: Settings }
  | { type: 'addItem'; item: NewItem; id?: string }
  | { type: 'updateItem'; id: string; patch: Partial<Omit<CartItem, 'id'>> }
  | { type: 'removeItem'; id: string }
  | { type: 'linkProduct'; id: string; productId: string }
  | { type: 'changeQty'; id: string; delta: number }
  | { type: 'mergeAll' }
  | { type: 'addDeposit'; entry: Omit<DepositEntry, 'id' | 'addedAt'> }
  | { type: 'updateDeposit'; id: string; patch: Partial<Omit<DepositEntry, 'id'>> }
  | { type: 'removeDeposit'; id: string }
  | { type: 'restoreSession'; session: Session }
  | { type: 'newSession' }
  | { type: 'settings'; patch: Partial<Omit<Settings, 'id'>> };

function touch(session: Session, patch: Partial<Session>): Session {
  return { ...session, ...patch, updatedAt: Date.now() };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'loaded':
      return { ready: true, session: action.session, settings: action.settings };
    case 'addItem': {
      const { items } = addItem(state.session.items, action.item, {
        merge: state.settings.mergeDuplicates,
        id: action.id,
      });
      return { ...state, session: touch(state.session, { items }) };
    }
    case 'updateItem': {
      const items = state.session.items.map((it) =>
        it.id === action.id
          ? {
              ...it,
              ...action.patch,
              quantity: sanitizeQuantity(action.patch.quantity ?? it.quantity),
            }
          : it,
      );
      return { ...state, session: touch(state.session, { items }) };
    }
    case 'linkProduct': {
      // Nur setzen, wenn die Position existiert und noch kein Produkt verknüpft ist (kein updatedAt-Touch nötig)
      if (!state.session.items.some((it) => it.id === action.id && !it.productId)) return state;
      return {
        ...state,
        session: {
          ...state.session,
          items: state.session.items.map((it) => (it.id === action.id ? { ...it, productId: action.productId } : it)),
        },
      };
    }
    case 'removeItem':
      return {
        ...state,
        session: touch(state.session, { items: state.session.items.filter((it) => it.id !== action.id) }),
      };
    case 'changeQty': {
      const target = state.session.items.find((it) => it.id === action.id);
      if (!target) return state;
      const next = target.quantity + action.delta;
      if (next < 1) return reducer(state, { type: 'removeItem', id: action.id });
      return reducer(state, { type: 'updateItem', id: action.id, patch: { quantity: next } });
    }
    case 'mergeAll':
      return { ...state, session: touch(state.session, { items: mergeAll(state.session.items) }) };
    case 'addDeposit': {
      const entry: DepositEntry = {
        ...action.entry,
        count: sanitizeQuantity(action.entry.count),
        id: uid(),
        addedAt: Date.now(),
      };
      return { ...state, session: touch(state.session, { deposits: [entry, ...state.session.deposits] }) };
    }
    case 'updateDeposit':
      return {
        ...state,
        session: touch(state.session, {
          deposits: state.session.deposits.map((d) =>
            d.id === action.id ? { ...d, ...action.patch, count: sanitizeQuantity(action.patch.count ?? d.count) } : d,
          ),
        }),
      };
    case 'removeDeposit':
      return {
        ...state,
        session: touch(state.session, { deposits: state.session.deposits.filter((d) => d.id !== action.id) }),
      };
    case 'restoreSession':
      return { ...state, session: touch(action.session, {}) };
    case 'newSession':
      return { ...state, session: emptySession() };
    case 'settings':
      return { ...state, settings: { ...state.settings, ...action.patch } };
  }
}
