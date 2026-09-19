import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = {
  user: null as unknown,
  loading: false,
  passwordRecovery: false,
  endPasswordRecovery: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  resetPassword: vi.fn(),
  updatePassword: vi.fn(),
};

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../lib/supabase', () => ({ supabase: { auth: { resend: vi.fn() } } }));

import { Auth } from './Auth';

function renderAuth(path = '/auth') {
  return render(<MemoryRouter initialEntries={[path]}><Auth /></MemoryRouter>);
}

beforeEach(() => {
  auth.passwordRecovery = false;
  auth.updatePassword.mockReset();
  auth.endPasswordRecovery.mockReset();
  auth.signIn.mockReset();
  auth.signUp.mockReset();
});

describe('Auth', () => {
  it('opens on sign-in by default', () => {
    renderAuth();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('NEW PASSWORD')).not.toBeInTheDocument();
  });

  it('shows the reset form when a recovery link signed the person in', () => {
    auth.passwordRecovery = true;
    renderAuth('/');
    expect(screen.getByLabelText('NEW PASSWORD')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /update password/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /keep my current password/i })).toBeInTheDocument();
  });

  it('shows the reset form from ?reset=true even without the flag', () => {
    renderAuth('/auth?reset=true');
    expect(screen.getByLabelText('NEW PASSWORD')).toBeInTheDocument();
  });

  it('rejects mismatched or short passwords before calling Supabase', async () => {
    auth.passwordRecovery = true;
    renderAuth('/');
    fireEvent.change(screen.getByLabelText('NEW PASSWORD'), { target: { value: 'correct horse battery' } });
    fireEvent.change(screen.getByLabelText('CONFIRM PASSWORD'), { target: { value: 'wrong horse battery' } });
    fireEvent.submit(screen.getByRole('button', { name: /update password/i }).closest('form')!);
    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(auth.updatePassword).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('NEW PASSWORD'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('CONFIRM PASSWORD'), { target: { value: 'short' } });
    fireEvent.submit(screen.getByRole('button', { name: /update password/i }).closest('form')!);
    expect(await screen.findByText(/at least 10 characters/i)).toBeInTheDocument();
    expect(auth.updatePassword).not.toHaveBeenCalled();
  });

  it('updates the password and confirms', async () => {
    auth.passwordRecovery = true;
    auth.updatePassword.mockResolvedValue(undefined);
    renderAuth('/');
    fireEvent.change(screen.getByLabelText('NEW PASSWORD'), { target: { value: 'correct horse battery' } });
    fireEvent.change(screen.getByLabelText('CONFIRM PASSWORD'), { target: { value: 'correct horse battery' } });
    fireEvent.submit(screen.getByRole('button', { name: /update password/i }).closest('form')!);
    await waitFor(() => expect(auth.updatePassword).toHaveBeenCalledWith('correct horse battery'));
    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();
  });

  it('lets the person keep their current password', () => {
    auth.passwordRecovery = true;
    renderAuth('/');
    fireEvent.click(screen.getByRole('button', { name: /keep my current password/i }));
    expect(auth.endPasswordRecovery).toHaveBeenCalledTimes(1);
  });

  it('turns a bad sign-in into plain copy', async () => {
    auth.signIn.mockRejectedValue(new Error('Invalid login credentials'));
    renderAuth();
    fireEvent.change(screen.getByLabelText('EMAIL'), { target: { value: 'cam@example.com' } });
    fireEvent.change(screen.getByLabelText('PASSWORD'), { target: { value: 'whatever-it-was' } });
    fireEvent.submit(screen.getByRole('button', { name: /^sign in$/i }).closest('form')!);
    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument();
  });
});
