import { describe, it, expect } from 'vitest';
import {
  slugFromName, normalizeConfigs, dollarsToCents, centsToDollars, friendlyKitError, SLUG_RE, KIT_PLATFORMS,
} from './mediaKitAdmin';

describe('media kit admin helpers', () => {
  it('derives a valid slug from any brand name', () => {
    expect(slugFromName('Gibsunday')).toBe('gibsunday');
    expect(slugFromName('Hey Cam!')).toBe('hey-cam');
    expect(slugFromName('  --Sundays Creative Co.--  ')).toBe('sundays-creative-co');
    expect(slugFromName('AB')).toBe('ab-kit');
    for (const n of ['Gibsunday', 'Hey Cam!', 'x', 'A very long brand name that goes on and on forever']) {
      expect(SLUG_RE.test(slugFromName(n))).toBe(true);
    }
  });

  it('keeps stored platform order, adds connected ones visible, hides the rest', () => {
    const stored = [
      { platform: 'youtube', visible: true, show_growth: false, followers_override: 1200 },
      { platform: 'instagram', visible: false },
    ];
    const out = normalizeConfigs(stored, ['instagram', 'tiktok']);
    expect(out.map((c) => c.platform).slice(0, 3)).toEqual(['youtube', 'instagram', 'tiktok']);
    expect(out[0].followers_override).toBe(1200);
    expect(out[0].show_growth).toBe(false);
    expect(out[1].visible).toBe(false);
    expect(out[2].visible).toBe(true);
    expect(out.find((c) => c.platform === 'threads')?.visible).toBe(false);
    expect(out).toHaveLength(KIT_PLATFORMS.length);
  });

  it('tolerates garbage in the stored JSON', () => {
    expect(normalizeConfigs(null, [])).toHaveLength(KIT_PLATFORMS.length);
    expect(normalizeConfigs([{ nope: 1 }, 'x', { platform: 'instagram', followers_override: 'abc' }], [])[0]).toMatchObject({
      platform: 'instagram',
      followers_override: null,
    });
  });

  it('keeps money in integer cents', () => {
    expect(dollarsToCents('500')).toBe(50000);
    expect(dollarsToCents('$1,250.50')).toBe(125050);
    expect(dollarsToCents('')).toBeNull();
    expect(dollarsToCents('-5')).toBe(500);
    expect(centsToDollars(50000)).toBe('500');
    expect(centsToDollars(125050)).toBe('1250.50');
    expect(centsToDollars(null)).toBe('');
  });

  it('turns database errors into one actionable sentence', () => {
    expect(friendlyKitError({ code: '23505', message: 'duplicate key value violates unique constraint "media_kits_slug_key"' }))
      .toMatch(/already taken/);
    expect(friendlyKitError({ code: '23505', message: 'violates unique constraint "media_kits_one_per_brand"' }))
      .toMatch(/already has a media kit/);
    expect(friendlyKitError({ code: '23514', message: 'check' })).toMatch(/3 to 32/);
    expect(friendlyKitError(null)).toBe('Something went wrong.');
  });
});
