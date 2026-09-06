import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

/**
 * Brand workspaces: which BRAND the app is acting as.
 *
 * A brand is the tenant. It owns social accounts, posts, metrics, ideas,
 * briefs, deals and voice, and brands are fully isolated: nothing aggregates
 * across them, and RLS refuses rows from a brand the caller does not own
 * (migration 20260904170000_brand_isolation.sql). This provider sits ABOVE
 * AccountProvider, which filters the Post for Me account list to the active
 * brand, so every surface that reads useAccount() inherits brand scope.
 *
 *   activeBrand — always set once loaded. There is no "all brands" view;
 *   isolation means there is no such thing.
 *
 * The selection persists in localStorage. Default is the brand flagged
 * is_default, the one the Phase 1 backfill created for existing users and the
 * profile trigger creates for new ones.
 */

const STORAGE_KEY = 'clio_active_brand';

export interface Brand {
  id: string;
  name: string;
  slug: string;
  is_default: boolean;
}

/** pfm_account_id → brand_id for every account mapped under this user's brands. */
export type AccountBrandMap = Map<string, string>;

export interface AssignableAccount {
  id: string;
  platform: string;
  username?: string | null;
}

interface BrandContextValue {
  brands: Brand[];
  /** The brand the app is acting as. Null only while loading or signed out. */
  activeBrand: Brand | null;
  setActiveBrand: (brand: Brand) => void;
  loading: boolean;
  accountBrandMap: AccountBrandMap;
  /** Create a brand owned by the current user and switch to it. */
  createBrand: (name: string) => Promise<Brand>;
  /** Map a Post for Me account to a brand, or move it to another one. */
  assignAccount: (account: AssignableAccount, brandId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const BrandContext = createContext<BrandContextValue>({
  brands: [],
  activeBrand: null,
  setActiveBrand: () => {},
  loading: true,
  accountBrandMap: new Map(),
  createBrand: async () => {
    throw new Error('BrandProvider missing');
  },
  assignAccount: async () => {},
  refresh: async () => {},
});

/** Same rule as the SQL backfill: lowercase, non-alphanumerics collapse to '-'. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function BrandProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [accountBrandMap, setAccountBrandMap] = useState<AccountBrandMap>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const refresh = useCallback(async () => {
    if (!user) {
      setBrands([]);
      setAccountBrandMap(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [brandRes, mapRes] = await Promise.all([
        supabase
          .from('brands')
          .select('id, name, slug, is_default')
          .eq('owner_id', user.id)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true }),
        // RLS already limits this to brands the user owns.
        supabase.from('brand_social_accounts').select('pfm_account_id, brand_id'),
      ]);
      if (brandRes.error) throw brandRes.error;
      setBrands((brandRes.data ?? []) as Brand[]);
      const map: AccountBrandMap = new Map();
      for (const row of (mapRes.data ?? []) as { pfm_account_id: string; brand_id: string }[]) {
        map.set(row.pfm_account_id, row.brand_id);
      }
      setAccountBrandMap(map);
    } catch (err) {
      console.warn('brands load failed:', (err as Error).message);
      setBrands([]);
      setAccountBrandMap(new Map());
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Signed out → forget; signed (back) in → re-read the persisted choice.
  useEffect(() => {
    if (!user) {
      setSelectedId(null);
      return;
    }
    try {
      setSelectedId(localStorage.getItem(STORAGE_KEY));
    } catch {
      setSelectedId(null);
    }
  }, [user]);

  const activeBrand = useMemo(() => {
    if (loading || brands.length === 0) return null;
    if (selectedId) {
      const found = brands.find((b) => b.id === selectedId);
      if (found) return found;
    }
    return brands.find((b) => b.is_default) ?? brands[0];
  }, [brands, selectedId, loading]);

  const setActiveBrand = useCallback((brand: Brand) => {
    setSelectedId(brand.id);
    try {
      localStorage.setItem(STORAGE_KEY, brand.id);
    } catch {
      // Private mode / storage full — selection still works for this session.
    }
  }, []);

  const createBrand = useCallback(
    async (name: string): Promise<Brand> => {
      if (!user) throw new Error('Not signed in');
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Give the brand a name');
      const slug = slugify(trimmed) || 'brand';
      const { data, error } = await supabase
        .from('brands')
        .insert({ owner_id: user.id, name: trimmed, slug })
        .select('id, name, slug, is_default')
        .single();
      if (error) {
        if (error.code === '23505') throw new Error(`You already have a brand called "${trimmed}"`);
        throw new Error(error.message);
      }
      const brand = data as Brand;
      await refresh();
      setActiveBrand(brand);
      return brand;
    },
    [user, refresh, setActiveBrand],
  );

  const assignAccount = useCallback(
    async (account: AssignableAccount, brandId: string) => {
      const { error } = await supabase.from('brand_social_accounts').upsert(
        {
          pfm_account_id: account.id,
          brand_id: brandId,
          platform: account.platform,
          username: account.username ?? null,
        },
        { onConflict: 'pfm_account_id' },
      );
      if (error) throw new Error(error.message);
      setAccountBrandMap((prev) => {
        const next = new Map(prev);
        next.set(account.id, brandId);
        return next;
      });
    },
    [],
  );

  return (
    <BrandContext.Provider
      value={{ brands, activeBrand, setActiveBrand, loading, accountBrandMap, createBrand, assignAccount, refresh }}
    >
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  return useContext(BrandContext);
}
