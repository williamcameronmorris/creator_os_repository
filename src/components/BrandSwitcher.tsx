import { useEffect, useRef, useState } from 'react';
import { Briefcase, Check, ChevronDown, Plus } from 'lucide-react';
import { useBrand, type Brand } from '../contexts/BrandContext';

/**
 * Header dropdown for the app-wide BRAND scope. Sits to the left of the
 * account switcher and reads first: brand, then account.
 *
 * Same shell as AccountSwitcher (cream-industrial: 0 radius, bg-card,
 * border-border, t-micro mono labels, gold var(--accent) marks the active
 * row). Always renders once brands have loaded, even with a single brand,
 * because "+ New brand" is how the second one gets created.
 */
export function BrandSwitcher() {
  const { brands, activeBrand, setActiveBrand, createBrand, loading } = useBrand();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setCreating(false);
      setName('');
      setError(null);
      return;
    }
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

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  if (loading || !activeBrand) return null;

  const pick = (brand: Brand) => {
    setActiveBrand(brand);
    setOpen(false);
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await createBrand(name);
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 h-7 px-2 border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors max-w-[160px]"
        aria-label="Switch brand"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Briefcase className="w-3.5 h-3.5 shrink-0" />
        <span className="t-micro truncate">{activeBrand.name}</span>
        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1 min-w-[220px] bg-card border border-border z-[70] shadow-sm"
        >
          <div className="t-micro text-muted-foreground px-3 pt-2.5 pb-1.5 border-b border-border">
            Brand
          </div>

          {brands.map((brand) => {
            const isActive = brand.id === activeBrand.id;
            return (
              <button
                key={brand.id}
                role="option"
                aria-selected={isActive}
                onClick={() => pick(brand)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted transition-colors"
              >
                <Briefcase
                  className="w-3.5 h-3.5 shrink-0"
                  style={isActive ? { color: 'var(--accent)' } : undefined}
                />
                <span className={`t-micro truncate ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {brand.name}
                </span>
                {isActive && (
                  <Check className="w-3 h-3 ml-auto shrink-0" style={{ color: 'var(--accent)' }} />
                )}
              </button>
            );
          })}

          {creating ? (
            <form
              className="px-3 py-2 border-t border-border"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input
                ref={inputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Brand name"
                aria-label="New brand name"
                className="w-full h-7 px-2 bg-background border border-border text-foreground t-micro outline-none focus:border-foreground"
                maxLength={60}
              />
              {error && (
                <div className="t-micro mt-1.5" style={{ color: 'var(--destructive, #c44)' }}>
                  {error}
                </div>
              )}
              <div className="flex items-center gap-3 mt-2">
                <button
                  type="submit"
                  disabled={busy || !name.trim()}
                  className="t-micro text-foreground hover:text-accent transition-colors disabled:opacity-50"
                >
                  {busy ? 'CREATING…' : 'CREATE'}
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="t-micro text-muted-foreground hover:text-foreground transition-colors"
                >
                  CANCEL
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left border-t border-border hover:bg-muted transition-colors"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="t-micro text-muted-foreground">New brand</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
