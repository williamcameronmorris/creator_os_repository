import { describe, it, expect } from 'vitest';
import { generateOAuthState, consumeOAuthState } from './oauthState';

describe('oauthState', () => {
  it('round-trips for a valid state', () => {
    const state = generateOAuthState('meta');
    expect(state).toHaveLength(32);
    expect(consumeOAuthState('meta', state)).toBe(true);
  });

  it('rejects mismatched state', () => {
    generateOAuthState('meta');
    expect(consumeOAuthState('meta', 'attacker-controlled-value')).toBe(false);
  });

  it('rejects when no state was generated', () => {
    expect(consumeOAuthState('threads', 'anything')).toBe(false);
  });

  it('rejects null/empty received state', () => {
    generateOAuthState('youtube');
    expect(consumeOAuthState('youtube', null)).toBe(false);
    expect(consumeOAuthState('youtube', '')).toBe(false);
  });

  it('is single-use (replay fails)', () => {
    const state = generateOAuthState('meta');
    expect(consumeOAuthState('meta', state)).toBe(true);
    expect(consumeOAuthState('meta', state)).toBe(false);
  });

  it('always clears storage, even on mismatch, to prevent replay', () => {
    const state = generateOAuthState('meta');
    consumeOAuthState('meta', 'wrong');
    expect(consumeOAuthState('meta', state)).toBe(false);
  });

  it('scopes state per provider', () => {
    const metaState = generateOAuthState('meta');
    const threadsState = generateOAuthState('threads');
    expect(metaState).not.toBe(threadsState);
    expect(consumeOAuthState('meta', metaState)).toBe(true);
    expect(consumeOAuthState('threads', threadsState)).toBe(true);
  });

  it('state from one provider does not unlock another', () => {
    const metaState = generateOAuthState('meta');
    generateOAuthState('threads');
    expect(consumeOAuthState('threads', metaState)).toBe(false);
  });

  it('generates unique values across calls', () => {
    const values = new Set(Array.from({ length: 20 }, () => generateOAuthState('meta')));
    expect(values.size).toBe(20);
  });
});
