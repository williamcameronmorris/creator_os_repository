import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({
      value: store.has(key) ? store.get(key)! : null,
    })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      store.set(key, value);
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      store.delete(key);
    }),
  },
}));

import { getDraft, setDraft, clearDraft } from './draftStorage';
import { Preferences } from '@capacitor/preferences';

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe('draftStorage', () => {
  it('round-trips a draft', async () => {
    await setDraft('draft_new_user-1', {
      caption: 'hello world',
      platforms: ['instagram', 'tiktok'],
      scheduledDate: '2026-05-01T10:00',
    });

    const draft = await getDraft('draft_new_user-1');
    expect(draft).toEqual({
      caption: 'hello world',
      platforms: ['instagram', 'tiktok'],
      scheduledDate: '2026-05-01T10:00',
    });
  });

  it('returns null when no draft is stored', async () => {
    expect(await getDraft('never-saved')).toBe(null);
  });

  it('clears a draft', async () => {
    await setDraft('draft_new_user-1', { caption: 'x' });
    await clearDraft('draft_new_user-1');
    expect(await getDraft('draft_new_user-1')).toBe(null);
  });

  it('isolates drafts by key', async () => {
    await setDraft('a', { caption: 'one' });
    await setDraft('b', { caption: 'two' });
    expect((await getDraft('a'))?.caption).toBe('one');
    expect((await getDraft('b'))?.caption).toBe('two');
  });

  it('returns null on malformed JSON instead of throwing', async () => {
    store.set('corrupt', '{ not json');
    expect(await getDraft('corrupt')).toBe(null);
  });

  it('swallows Preferences.set failures (autosave must not break composition)', async () => {
    vi.mocked(Preferences.set).mockRejectedValueOnce(new Error('storage full'));
    await expect(setDraft('k', { caption: 'x' })).resolves.toBeUndefined();
  });

  it('swallows Preferences.remove failures', async () => {
    vi.mocked(Preferences.remove).mockRejectedValueOnce(new Error('boom'));
    await expect(clearDraft('k')).resolves.toBeUndefined();
  });
});
