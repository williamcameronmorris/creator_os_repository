/**
 * Draft storage for unpublished post content.
 *
 * Uses @capacitor/preferences which maps to:
 *   - iOS:     UserDefaults (sandboxed, survives app updates + storage pressure)
 *   - Android: SharedPreferences
 *   - Web:     localStorage (parity with previous behavior)
 *
 * Drafts can contain unpublished captions, so we want the most durable
 * per-app sandbox available on each platform. All calls are async.
 */

import { Preferences } from '@capacitor/preferences';

export interface Draft {
  caption?: string;
  platforms?: string[];
  scheduledDate?: string;
}

export async function getDraft(key: string): Promise<Draft | null> {
  try {
    const { value } = await Preferences.get({ key });
    if (!value) return null;
    return JSON.parse(value) as Draft;
  } catch {
    return null;
  }
}

export async function setDraft(key: string, draft: Draft): Promise<void> {
  try {
    await Preferences.set({ key, value: JSON.stringify(draft) });
  } catch {
    // Best-effort — autosave failure should not break composition.
  }
}

export async function clearDraft(key: string): Promise<void> {
  try {
    await Preferences.remove({ key });
  } catch {
    // Best-effort.
  }
}
