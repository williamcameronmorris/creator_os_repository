import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * An in-app confirm, replacing window.confirm().
 *
 * Same shape as the native call so a call site changes one line:
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: 'Delete this post?', danger: true }))) return;
 *
 * Resolves true on the confirm button, false on the cancel button, and null
 * when the person backs out (Escape, backdrop, or the optional dismiss link).
 * Most callers treat null like false; the brand-move flow, where cancel is
 * itself an action, tells the two apart.
 */

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button with the destructive colour. */
  danger?: boolean;
  /** A third, quiet way out. Resolves null. */
  dismissLabel?: string;
}

export type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean | null>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface Pending {
  opts: ConfirmOptions;
  resolve: (v: boolean | null) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirmBtn = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise((resolve) => setPending({ opts, resolve }));
  }, []);

  const settle = useCallback(
    (v: boolean | null) => {
      pending?.resolve(v);
      setPending(null);
    },
    [pending],
  );

  useEffect(() => {
    if (!pending) return;
    confirmBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settle(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, settle]);

  const o = pending?.opts;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {o && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => settle(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="w-full max-w-md bg-background border p-6"
            style={{ borderColor: o.danger ? 'var(--destructive)' : 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="t-micro mb-3" style={o.danger ? { color: 'var(--destructive)' } : undefined}>
              {o.danger ? 'CONFIRM' : 'ONE MOMENT'}
            </div>
            <h2
              id="confirm-title"
              className="text-foreground mb-3"
              style={{ fontSize: '1.375rem', fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.2 }}
            >
              {o.title}
            </h2>
            {o.message && <div className="t-body mb-6">{o.message}</div>}

            <div className="flex flex-wrap items-center gap-3 justify-end">
              {o.dismissLabel && (
                <button
                  type="button"
                  onClick={() => settle(null)}
                  className="t-micro mr-auto text-muted-foreground hover:text-foreground transition-colors"
                >
                  {o.dismissLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => settle(false)}
                className="t-micro px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {o.cancelLabel ?? 'Cancel'}
              </button>
              <button
                ref={confirmBtn}
                type="button"
                onClick={() => settle(true)}
                className={o.danger ? 't-micro px-3 py-2 border transition-colors' : 'btn-ie btn-ie-solid'}
                style={o.danger ? { borderColor: 'var(--destructive)', color: 'var(--destructive)' } : undefined}
              >
                {o.danger ? (
                  o.confirmLabel ?? 'Delete'
                ) : (
                  <span className="btn-ie-text">{o.confirmLabel ?? 'Continue'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

// Without a provider (a unit test), refuse rather than silently proceed.
const FALLBACK: ConfirmFn = async (opts) => {
  console.warn('[confirm] no ConfirmProvider mounted; refusing:', opts.title);
  return false;
};

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext) ?? FALLBACK;
}
