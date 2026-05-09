import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

// Stub Supabase env so modules that import ./lib/supabase don't throw at load.
// Real integration is never hit in unit tests — anything that talks to Supabase
// must be mocked explicitly in the test.
vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:54321');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

// jsdom in this project's vitest setup ships a broken localStorage — it's a
// plain `{}` object instead of a real Storage instance, which throws
// "localStorage.setItem is not a function" when code under test tries to use
// it. sessionStorage works fine. Polyfill localStorage with a Map-backed shim
// so any code under test that uses localStorage behaves the same way it does
// in the real browser. Scoped to tests; production code is unchanged.
if (typeof localStorage !== 'object' || typeof localStorage.setItem !== 'function') {
  const m = new Map<string, string>();
  const shim: Storage = {
    get length() { return m.size; },
    clear() { m.clear(); },
    getItem(k: string) { return m.has(k) ? m.get(k)! : null; },
    setItem(k: string, v: string) { m.set(k, String(v)); },
    removeItem(k: string) { m.delete(k); },
    key(i: number) { return Array.from(m.keys())[i] ?? null; },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: shim,
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
