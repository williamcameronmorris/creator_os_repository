import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

// Stub Supabase env so modules that import ./lib/supabase don't throw at load.
// Real integration is never hit in unit tests — anything that talks to Supabase
// must be mocked explicitly in the test.
vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:54321');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

afterEach(() => {
  sessionStorage.clear();
});
