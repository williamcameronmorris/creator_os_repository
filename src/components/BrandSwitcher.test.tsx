import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrandSwitcher } from './BrandSwitcher';
import type { Brand } from '../contexts/BrandContext';

const createBrand = vi.fn();
const setActiveBrand = vi.fn();
const gibsunday: Brand = { id: 'b1', name: 'Gibsunday', slug: 'gibsunday', is_default: true };
const heyCam: Brand = { id: 'b2', name: 'Hey Cam', slug: 'hey-cam', is_default: false };
let state: { brands: Brand[]; activeBrand: Brand | null; loading: boolean } = {
  brands: [gibsunday, heyCam],
  activeBrand: gibsunday,
  loading: false,
};

// The factory is hoisted; everything it hands back reads `state` lazily at
// render time, after the module-level `let` above has been initialised.
vi.mock('../contexts/BrandContext', () => ({
  useBrand: () => ({
    ...state,
    setActiveBrand,
    createBrand,
    accountBrandMap: new Map(),
    assignAccount: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const trigger = () => screen.getByRole('button', { name: /switch brand/i });

describe('BrandSwitcher', () => {
  beforeEach(() => {
    createBrand.mockReset();
    setActiveBrand.mockReset();
    state = { brands: [gibsunday, heyCam], activeBrand: gibsunday, loading: false };
  });

  it('shows the active brand and lists the others', () => {
    render(<BrandSwitcher />);
    expect(trigger().textContent).toContain('Gibsunday');
    fireEvent.click(trigger());
    expect(screen.getByRole('option', { name: /hey cam/i })).toBeTruthy();
    expect(screen.getByRole('option', { name: /gibsunday/i }).getAttribute('aria-selected')).toBe('true');
  });

  it('switches brand when another is picked', () => {
    render(<BrandSwitcher />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('option', { name: /hey cam/i }));
    expect(setActiveBrand).toHaveBeenCalledWith(heyCam);
  });

  it('creates a brand from the inline form', async () => {
    createBrand.mockResolvedValue({ id: 'b3', name: 'Sundays', slug: 'sundays', is_default: false });
    render(<BrandSwitcher />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByText(/new brand/i));
    fireEvent.change(screen.getByLabelText(/new brand name/i), { target: { value: 'Sundays' } });
    fireEvent.click(screen.getByText('CREATE'));
    await waitFor(() => expect(createBrand).toHaveBeenCalledWith('Sundays'));
  });

  it('surfaces a create failure instead of closing', async () => {
    createBrand.mockRejectedValue(new Error('You already have a brand called "Gibsunday"'));
    render(<BrandSwitcher />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByText(/new brand/i));
    fireEvent.change(screen.getByLabelText(/new brand name/i), { target: { value: 'Gibsunday' } });
    fireEvent.click(screen.getByText('CREATE'));
    await waitFor(() => expect(screen.getByText(/already have a brand/i)).toBeTruthy());
  });

  it('renders nothing until brands have loaded', () => {
    state = { brands: [], activeBrand: null, loading: true };
    const { container } = render(<BrandSwitcher />);
    expect(container.innerHTML).toBe('');
  });
});
