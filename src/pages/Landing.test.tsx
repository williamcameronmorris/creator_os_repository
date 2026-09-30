import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Landing } from './Landing';

const mount = () => render(<MemoryRouter><Landing /></MemoryRouter>);

/**
 * Google rejected the app once for a home page behind a login. These assert the
 * things a reviewer looks for, so a later edit cannot quietly drop one and cost
 * another review cycle.
 */
describe('public landing page', () => {
  it('says what the app does without needing an account', () => {
    mount();
    expect(screen.getByText(/content planning and publishing app/i)).toBeTruthy();
  });

  it('names the exact Google scope requested and what it is used for', () => {
    mount();
    expect(screen.getByText('youtube.readonly')).toBeTruthy();
    expect(screen.getByText(/subscriber count/i)).toBeTruthy();
  });

  it('states what the app will not do with YouTube access', () => {
    mount();
    expect(screen.getByText(/does not upload, edit, delete or\s+comment on anything/i)).toBeTruthy();
  });

  it('carries the Limited Use declaration Google requires', () => {
    mount();
    expect(screen.getByText(/Limited Use requirements/i)).toBeTruthy();
    const policy = screen.getByText('Google API Services User Data Policy');
    expect(policy.getAttribute('href')).toBe(
      'https://developers.google.com/terms/api-services-user-data-policy',
    );
  });

  it('links the privacy policy and terms', () => {
    mount();
    expect(screen.getByText('PRIVACY').getAttribute('href')).toBe('/privacy');
    expect(screen.getByText('TERMS').getAttribute('href')).toBe('/terms');
  });

  it('offers a way in without being one', () => {
    mount();
    expect(screen.getByText('Create an account')).toBeTruthy();
    expect(screen.getByText('SIGN IN')).toBeTruthy();
  });
});
