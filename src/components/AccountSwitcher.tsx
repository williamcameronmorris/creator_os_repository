import { useEffect, useRef, useState } from 'react';
import {
  Instagram, Youtube, Facebook, Twitter, Cloud, AtSign, Sparkles,
  ChevronDown, Check, Layers,
} from 'lucide-react';
import { useAccount } from '../contexts/AccountContext';
import type { PostForMeAccount } from '../lib/postforme';

/**
 * Compact header dropdown for the app-wide account scope.
 *
 * Lists every connected PFM account (platform icon + @username) plus an
 * "All accounts" option (activeAccount = null → legacy user-level view).
 * Renders nothing when the user has no connected accounts — the switcher only
 * matters once there's something to switch between.
 *
 * Cream-industrial: 0 radius, bg-card/border-border, t-micro mono labels,
 * gold var(--accent) marks the active row.
 */

// Same icon set the Compose account picker uses (PFM platform ids).
const PLATFORM_ICONS: Record<string, React.ElementType> = {
  instagram: Instagram,
  youtube: Youtube,
  facebook: Facebook,
  x: Twitter,
  tiktok: Sparkles,
  threads: AtSign,
  bluesky: Cloud,
};

function accountLabel(account: PostForMeAccount): string {
  return account.username ? `@${account.username}` : account.platform;
}

export function AccountSwitcher() {
  const { accounts, activeAccount, setActiveAccount, loading } = useAccount();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (loading || accounts.length === 0) return null;

  const ActiveIcon = activeAccount
    ? (PLATFORM_ICONS[activeAccount.platform] ?? AtSign)
    : Layers;
  const activeLabel = activeAccount ? accountLabel(activeAccount) : 'All accounts';

  const pick = (account: PostForMeAccount | null) => {
    setActiveAccount(account);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 h-7 px-2 border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors max-w-[160px]"
        aria-label="Switch account"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <ActiveIcon className="w-3.5 h-3.5 shrink-0" />
        <span className="t-micro truncate">{activeLabel}</span>
        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1 min-w-[200px] bg-card border border-border z-[70] shadow-sm"
        >
          <div className="t-micro text-muted-foreground px-3 pt-2.5 pb-1.5 border-b border-border">
            Acting as
          </div>

          {accounts.map((account) => {
            const Icon = PLATFORM_ICONS[account.platform] ?? AtSign;
            const isActive = activeAccount?.id === account.id;
            return (
              <button
                key={account.id}
                role="option"
                aria-selected={isActive}
                onClick={() => pick(account)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted transition-colors"
              >
                <Icon
                  className="w-3.5 h-3.5 shrink-0"
                  style={isActive ? { color: 'var(--accent)' } : undefined}
                />
                <span className={`t-micro truncate ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {accountLabel(account)}
                </span>
                {isActive && (
                  <Check className="w-3 h-3 ml-auto shrink-0" style={{ color: 'var(--accent)' }} />
                )}
              </button>
            );
          })}

          <button
            role="option"
            aria-selected={activeAccount === null}
            onClick={() => pick(null)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left border-t border-border hover:bg-muted transition-colors"
          >
            <Layers
              className="w-3.5 h-3.5 shrink-0"
              style={activeAccount === null ? { color: 'var(--accent)' } : undefined}
            />
            <span className={`t-micro ${activeAccount === null ? 'text-foreground' : 'text-muted-foreground'}`}>
              All accounts
            </span>
            {activeAccount === null && (
              <Check className="w-3 h-3 ml-auto shrink-0" style={{ color: 'var(--accent)' }} />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
