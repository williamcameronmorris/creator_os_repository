import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

// Capture the auth-state listener so tests can emit Supabase events directly.
type Listener = (event: string, session: unknown) => void;
const listeners: Listener[] = [];
const getSession = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
      onAuthStateChange: (cb: Listener) => {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      signOut: vi.fn(),
    },
  },
}));

import { AuthProvider, useAuth } from './AuthContext';

const session = { user: { id: 'u1', email: 'cam@example.com' } };

function Probe() {
  const { user, loading, passwordRecovery, endPasswordRecovery } = useAuth();
  return (
    <div>
      <span data-testid="state">
        {loading ? 'loading' : user ? 'in' : 'out'}:{passwordRecovery ? 'recovery' : 'normal'}
      </span>
      <button onClick={endPasswordRecovery}>done</button>
    </div>
  );
}

beforeEach(() => {
  listeners.length = 0;
  getSession.mockReset();
  window.history.replaceState(null, '', '/');
});

describe('AuthProvider password recovery', () => {
  it('flags recovery when Supabase emits PASSWORD_RECOVERY', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('out:normal'));

    act(() => listeners.forEach((l) => l('PASSWORD_RECOVERY', session)));
    expect(screen.getByTestId('state')).toHaveTextContent('in:recovery');
  });

  it('flags recovery from ?reset=true when the session restores before the event', async () => {
    window.history.replaceState(null, '', '/?reset=true');
    getSession.mockResolvedValue({ data: { session } });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('in:recovery'));
  });

  it('does not flag recovery on an ordinary sign-in', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('out:normal'));

    act(() => listeners.forEach((l) => l('SIGNED_IN', session)));
    expect(screen.getByTestId('state')).toHaveTextContent('in:normal');
  });

  it('endPasswordRecovery clears the flag and strips the query', async () => {
    window.history.replaceState(null, '', '/?reset=true');
    getSession.mockResolvedValue({ data: { session } });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('in:recovery'));

    act(() => screen.getByText('done').click());
    expect(screen.getByTestId('state')).toHaveTextContent('in:normal');
    expect(window.location.search).toBe('');
  });

  it('clears recovery on sign-out', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('out:normal'));

    act(() => listeners.forEach((l) => l('PASSWORD_RECOVERY', session)));
    act(() => listeners.forEach((l) => l('SIGNED_OUT', null)));
    expect(screen.getByTestId('state')).toHaveTextContent('out:normal');
  });
});
