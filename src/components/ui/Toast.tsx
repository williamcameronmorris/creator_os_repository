import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

/**
 * In-app toasts, replacing window.alert().
 *
 * alert() renders as "localhost says:" inside the mobile shell and blocks the
 * thread. These stack above the bottom nav, read out through aria-live, and
 * clear themselves. Errors stay a little longer than confirmations.
 *
 *   const toast = useToast();
 *   toast.error('Could not delete the post.');
 *   toast.success('Saved.');
 */

type ToastKind = 'error' | 'success' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

export interface ToastApi {
  error: (message: string) => void;
  success: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TTL: Record<ToastKind, number> = { error: 7000, success: 4000, info: 5000 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const show = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++;
    setItems((prev) => [...prev.slice(-3), { id, kind, message }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), TTL[kind]);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      error: (m) => show('error', m),
      success: (m) => show('success', m),
      info: (m) => show('info', m),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="fixed left-0 right-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none"
        style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px) + 12px)' }}
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto w-full max-w-md bg-card border border-border px-4 py-3 text-sm text-foreground shadow-lg"
            style={{
              borderLeft: `3px solid ${t.kind === 'error' ? 'var(--destructive)' : 'var(--accent)'}`,
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Outside the provider (a unit test rendering one component) the call still
// lands somewhere visible instead of throwing.
const FALLBACK: ToastApi = {
  error: (m) => console.error('[toast]', m),
  success: (m) => console.log('[toast]', m),
  info: (m) => console.log('[toast]', m),
};

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? FALLBACK;
}
