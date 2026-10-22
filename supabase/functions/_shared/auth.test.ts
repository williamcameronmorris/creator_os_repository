// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  optionalUser,
  requireService,
  requireServiceOrCron,
  requireUser,
  requireUserOrCron,
  resolveBrandId,
  safeEqual,
} from './auth.ts';

const SERVICE_KEY = 'service-role-key-for-tests';
const CRON = 'cron-secret-for-tests';
let env: Record<string, string | undefined>;

beforeEach(() => {
  env = { SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, Cron_Secret: CRON, Default_PFM_User_Id: 'default-user' };
  vi.stubGlobal('Deno', { env: { get: (k: string) => env[k] } });
});
afterEach(() => vi.unstubAllGlobals());

const req = (bearer?: string) =>
  new Request('https://fn.test', { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });

/** auth.getUser accepts exactly one token, for user `u1`. */
function authClient(validToken = 'good-jwt') {
  return {
    auth: {
      getUser: vi.fn(async (token: string) =>
        token === validToken
          ? { data: { user: { id: 'u1' } }, error: null }
          : { data: { user: null }, error: { message: 'invalid' } }),
    },
  } as unknown as SupabaseClient;
}

describe('safeEqual', () => {
  it('compares by value', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('requireUser', () => {
  it('returns the token-bound user id', async () => {
    expect(await requireUser(req('good-jwt'), authClient())).toEqual({ ok: true, userId: 'u1', isCron: false });
  });

  it('401s with no bearer or a bad one', async () => {
    for (const r of [req(), req('forged')]) {
      const res = await requireUser(r, authClient());
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.response.status).toBe(401);
    }
  });
});

describe('requireUserOrCron', () => {
  it('cron: trusts body.userId, falling back to the default user', async () => {
    expect(await requireUserOrCron(req(), authClient(), { cronSecret: CRON, userId: 'u9' }))
      .toEqual({ ok: true, userId: 'u9', isCron: true });
    expect(await requireUserOrCron(req(), authClient(), { cronSecret: CRON }))
      .toEqual({ ok: true, userId: 'default-user', isCron: true });
  });

  it('a wrong secret falls through to the session and ignores body.userId', async () => {
    expect(await requireUserOrCron(req('good-jwt'), authClient(), { cronSecret: 'nope', userId: 'victim' }))
      .toEqual({ ok: true, userId: 'u1', isCron: false });
  });

  it('never accepts a cron secret when none is configured', async () => {
    env.Cron_Secret = undefined;
    const res = await requireUserOrCron(req(), authClient(), { cronSecret: '', userId: 'victim' });
    expect(res.ok).toBe(false);
  });
});

describe('requireService / requireServiceOrCron', () => {
  it('accepts only the service-role bearer', () => {
    expect(requireService(req(SERVICE_KEY)).ok).toBe(true);
    expect(requireService(req('good-jwt')).ok).toBe(false);
    expect(requireService(req()).ok).toBe(false);
  });

  it('rejects everything when the service key is unset', () => {
    env.SUPABASE_SERVICE_ROLE_KEY = undefined;
    expect(requireService(req('')).ok).toBe(false);
  });

  it('accepts the cron secret or the service bearer, nothing else', () => {
    expect(requireServiceOrCron(req(), { cronSecret: CRON })).toEqual({ ok: true, via: 'cron' });
    expect(requireServiceOrCron(req(SERVICE_KEY), {})).toEqual({ ok: true, via: 'service' });
    expect(requireServiceOrCron(req('good-jwt'), { cronSecret: 'wrong' }).ok).toBe(false);
  });
});

describe('optionalUser', () => {
  it('is the user for a good token and null otherwise', async () => {
    expect(await optionalUser(req('good-jwt'), authClient())).toBe('u1');
    expect(await optionalUser(req('forged'), authClient())).toBeNull();
    expect(await optionalUser(req(), authClient())).toBeNull();
  });
});

// ── resolveBrandId ────────────────────────────────────────────────────────
type Row = Record<string, unknown>;
/** A tiny PostgREST stand-in: from(table).select().eq()...maybeSingle(). */
function db(tables: Record<string, Row[]>, failing: string[] = []) {
  return {
    from(table: string) {
      const filters: [string, unknown][] = [];
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => { filters.push([col, val]); return q; },
        maybeSingle: async () => {
          if (failing.includes(table)) return { data: null, error: { message: `${table} down` } };
          const rows = (tables[table] || []).filter((r) => filters.every(([c, v]) => r[c] === v));
          return { data: rows[0] ?? null, error: null };
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

const TABLES = {
  brand_social_accounts: [
    { pfm_account_id: 'acct-mine', brand_id: 'b-mine', brands: { owner_id: 'u1' } },
    { pfm_account_id: 'acct-theirs', brand_id: 'b-theirs', brands: { owner_id: 'u2' } },
  ],
  brands: [
    { id: 'b-default', owner_id: 'u1', is_default: true },
    { id: 'b-second', owner_id: 'u1', is_default: false },
    { id: 'b-theirs', owner_id: 'u2', is_default: true },
  ],
};

describe('resolveBrandId', () => {
  it("maps an account to its brand when it is the caller's", async () => {
    expect(await resolveBrandId(db(TABLES), 'u1', 'acct-mine')).toBe('b-mine');
  });

  it("throws for another user's account instead of guessing", async () => {
    await expect(resolveBrandId(db(TABLES), 'u1', 'acct-theirs')).rejects.toThrow(/not mapped to one of your brands/);
    await expect(resolveBrandId(db(TABLES), 'u1', 'acct-unknown', null, true)).rejects.toThrow(/not mapped/);
  });

  it('verifies a caller-supplied brand id against its owner', async () => {
    expect(await resolveBrandId(db(TABLES), 'u1', null, 'b-second')).toBe('b-second');
    await expect(resolveBrandId(db(TABLES), 'u1', null, 'b-theirs')).rejects.toThrow(/not yours/);
  });

  it('only falls back to the default brand when allowed', async () => {
    await expect(resolveBrandId(db(TABLES), 'u1')).rejects.toThrow(/No brand was given/);
    expect(await resolveBrandId(db(TABLES), 'u1', null, null, true)).toBe('b-default');
  });

  it('surfaces lookup errors rather than treating them as "no brand"', async () => {
    await expect(resolveBrandId(db(TABLES, ['brand_social_accounts']), 'u1', 'acct-mine')).rejects.toThrow(/down/);
  });
});
