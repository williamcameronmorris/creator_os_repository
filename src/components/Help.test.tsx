import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HELP_SECTIONS, Help } from './Help';

// Every route the app actually serves (src/App.tsx). A help link that points
// anywhere else is a broken promise to the person reading it.
const ROUTES = new Set([
  '/', '/studio', '/studio/workflow', '/studio/script', '/studio/templates', '/studio/challenge',
  '/media', '/saved-ideas', '/watch', '/office/connections', '/schedule', '/schedule/new',
  '/compose', '/drop', '/analytics', '/patra', '/profile', '/settings', '/help',
]);

describe('Help', () => {
  it('has one panel per section, in order, with every name on screen', () => {
    render(<MemoryRouter><Help /></MemoryRouter>);
    for (const s of HELP_SECTIONS) {
      expect(screen.getByRole('heading', { level: 3, name: s.name })).toBeTruthy();
    }
    const nums = HELP_SECTIONS.map((s) => Number(s.num));
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
    expect(HELP_SECTIONS[0].id).toBe('brands');
  });

  it('only links to routes the app serves', () => {
    for (const s of HELP_SECTIONS) {
      expect(s.links.length).toBeGreaterThan(0);
      for (const l of s.links) expect(ROUTES.has(l.to), `${s.id} → ${l.to}`).toBe(true);
    }
  });

  it('keeps every section short enough to read on a phone', () => {
    for (const s of HELP_SECTIONS) {
      expect(s.body.length).toBeLessThanOrEqual(3);
      for (const p of s.body) expect(p.length).toBeLessThanOrEqual(320);
    }
  });
});
