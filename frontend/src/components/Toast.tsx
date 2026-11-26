import { useState, useCallback, useEffect, useRef } from 'react';

export type ToastType = 'pending' | 'success' | 'error';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
  txHash?: string;
}

const EXPLORER_TX_BASE = 'https://stellar.expert/explorer/public/tx/';

function truncateHash(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : hash;
}

const COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
  pending: { bg: '#fffbeb', border: '#fbbf24', icon: '⏳' },
  success: { bg: '#f0fdf4', border: '#22c55e', icon: '✅' },
  error:   { bg: '#fef2f2', border: '#ef4444', icon: '❌' },
};

const AUTO_DISMISS_MS: Record<ToastType, number> = {
  pending: 0,      // stays until replaced/dismissed
  success: 4000,
  error:   6000,
};

let _nextId = 1;

// ── Hook ──────────────────────────────────────────────────────────────────

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const show = useCallback((type: ToastType, message: string, txHash?: string): number => {
    const id = _nextId++;
    setToasts(prev => [...prev, { id, type, message, txHash }]);
    const delay = AUTO_DISMISS_MS[type];
    if (delay > 0) {
      const timer = setTimeout(() => dismiss(id), delay);
      timers.current.set(id, timer);
    }
    return id;
  }, [dismiss]);

  // Clean up timers on unmount
  useEffect(() => {
    const t = timers.current;
    return () => { t.forEach(clearTimeout); t.clear(); };
  }, []);

  return { toasts, show, dismiss };
}

// ── Component ─────────────────────────────────────────────────────────────

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Notifications"
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        zIndex: 1000,
        maxWidth: 360,
      }}
    >
      {toasts.map(t => {
        const { bg, border, icon } = COLORS[t.type];
        return (
          <div
            key={t.id}
            role="status"
            style={{
              background: bg,
              border: `1px solid ${border}`,
              borderRadius: 8,
              padding: '0.65rem 1rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              fontSize: '0.875rem',
              color: '#1e293b',
            }}
          >
            <span aria-hidden="true">{icon}</span>
            <span style={{ flex: 1 }}>
              {t.message}
              {t.txHash && (
                <span style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.75rem' }}>
                  <a
                    href={`${EXPLORER_TX_BASE}${t.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#2563eb', textDecoration: 'underline' }}
                    title={t.txHash}
                  >
                    {truncateHash(t.txHash)}
                  </a>
                </span>
              )}
            </span>
            <button
              onClick={() => onDismiss(t.id)}
              aria-label="Dismiss notification"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#94a3b8',
                fontSize: '1rem',
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
