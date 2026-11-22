import { createContext, useCallback, useContext, useReducer, type ReactNode } from 'react';
import { explorerTxUrl } from '../config';

type ToastType = 'pending' | 'success' | 'error';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
  txHash?: string;
}

interface ToastState {
  toasts: Toast[];
  nextId: number;
}

type Action =
  | { type: 'ADD'; toast: Omit<Toast, 'id'> }
  | { type: 'REMOVE'; id: number };

function reducer(state: ToastState, action: Action): ToastState {
  switch (action.type) {
    case 'ADD':
      return { toasts: [...state.toasts, { ...action.toast, id: state.nextId }], nextId: state.nextId + 1 };
    case 'REMOVE':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.id) };
  }
}

interface ToastContextValue {
  notify: (type: ToastType, message: string, txHash?: string) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const COLORS: Record<ToastType, string> = {
  pending: '#1e40af',
  success: '#15803d',
  error: '#b91c1c',
};

const ICONS: Record<ToastType, string> = {
  pending: '⏳',
  success: '✅',
  error: '❌',
};

function truncateHash(hash: string): string {
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { toasts: [], nextId: 0 });

  const notify = useCallback((type: ToastType, message: string, txHash?: string): number => {
    const id = state.nextId;
    dispatch({ type: 'ADD', toast: { type, message, txHash } });
    if (type !== 'pending') {
      setTimeout(() => dispatch({ type: 'REMOVE', id }), 5000);
    }
    return id;
  }, [state.nextId]);

  const dismiss = useCallback((id: number) => dispatch({ type: 'REMOVE', id }), []);

  return (
    <ToastContext.Provider value={{ notify, dismiss }}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        aria-live="polite"
        style={{
          position: 'fixed', bottom: '1.5rem', right: '1.5rem',
          display: 'flex', flexDirection: 'column', gap: '0.5rem', zIndex: 200,
        }}
      >
        {state.toasts.map(t => (
          <div
            key={t.id}
            role="alert"
            style={{
              background: COLORS[t.type], color: '#fff',
              borderRadius: 8, padding: '0.75rem 1rem',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              minWidth: 260, maxWidth: 360, boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              fontSize: '0.875rem',
            }}
          >
            <span>{ICONS[t.type]}</span>
            <span style={{ flex: 1 }}>{t.message}</span>
            {t.txHash && (
              <a
                href={explorerTxUrl(t.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                title={t.txHash}
                aria-label={`View transaction ${t.txHash} on Stellar explorer`}
                style={{ color: '#bfdbfe', fontSize: '0.75rem', whiteSpace: 'nowrap', fontFamily: 'monospace' }}
              >
                {truncateHash(t.txHash)} ↗
              </a>
            )}
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
            >×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}