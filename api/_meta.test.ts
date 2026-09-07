import { describe, it, expect } from 'vitest';
import { buildMeta, injectHead, describe as describeKit, compact } from './_meta';

const payload = {
  kit: { slug: 'gibsunday', display_name: 'Gibsunday', headline: 'Guitars, gear & the people who play them', bio: null, avatar_url: 'https://cdn.example/logo.png' },
  totals: { followers: 160_651 },
  platforms: [{ platform: 'instagram', handle: 'gibsunday' }, { platform: 'youtube', handle: 'Gibsunday' }],
  top_posts: [{ thumbnail_url: 'https://cdn.example/top.jpg' }],
};

describe('kit link preview', () => {
  it('writes a card a brand can read in a DM', () => {
    const meta = buildMeta(payload, 'https://cliopatra.app/kit/gibsunday');
    expect(meta).toContain('<title>Gibsunday · Media kit</title>');
    expect(meta).toContain('property="og:image" content="https://cdn.example/logo.png"');
    expect(meta).toContain('name="twitter:card" content="summary_large_image"');
    expect(meta).toContain('161K followers across Instagram, YouTube');
    expect(meta).toContain('Guitars, gear &amp; the people');
  });

  it('falls back to the top post when there is no creator image', () => {
    const meta = buildMeta({ ...payload, kit: { ...payload.kit, avatar_url: null } }, 'https://x/kit/g');
    expect(meta).toContain('og:image" content="https://cdn.example/top.jpg"');
  });

  it('replaces the shell title and description instead of adding a second pair', () => {
    const shell = '<!doctype html><html><head>\n    <title>Cliopatra Social</title>\n    <meta name="description" content="generic" />\n  </head><body></body></html>';
    const out = injectHead(shell, buildMeta(payload, 'https://x/kit/g'));
    expect(out.match(/<title>/g)).toHaveLength(1);
    expect(out.match(/name="description"/g)).toHaveLength(1);
    expect(out).toContain('<title>Gibsunday · Media kit</title>');
    expect(out).toContain('</head><body>');
  });

  it('keeps the description short and compacts numbers', () => {
    expect(describeKit(payload).length).toBeLessThanOrEqual(200);
    expect(compact(9500)).toBe('9.5K');
    expect(compact(146119)).toBe('146K');
  });
});
