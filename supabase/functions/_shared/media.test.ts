// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectMediaKind, kindFromContentType, kindFromExtension } from './media.ts';

afterEach(() => vi.unstubAllGlobals());

describe('kindFromContentType', () => {
  it('reads the top-level type and ignores parameters', () => {
    expect(kindFromContentType('video/mp4')).toBe('video');
    expect(kindFromContentType('image/jpeg; charset=binary')).toBe('image');
    expect(kindFromContentType('application/octet-stream')).toBe('unknown');
    expect(kindFromContentType(null)).toBe('unknown');
  });
});

describe('kindFromExtension', () => {
  it('handles query strings and unknown extensions', () => {
    expect(kindFromExtension('https://x/a.MOV?token=1')).toBe('video');
    expect(kindFromExtension('https://x/a.webp')).toBe('image');
    expect(kindFromExtension('https://cdn.example/abc123')).toBe('unknown');
  });
});

describe('detectMediaKind', () => {
  it('trusts the served Content-Type over the URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200, headers: { 'content-type': 'video/quicktime' } })));
    // A CDN path with no extension, or a misleading one, is still a video.
    expect(await detectMediaKind('https://cdn.example/media/abc123')).toBe('video');
    expect(await detectMediaKind('https://cdn.example/media/abc.jpg')).toBe('video');
  });

  it('falls back to the extension when the host is generic or unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200, headers: { 'content-type': 'application/octet-stream' } })));
    expect(await detectMediaKind('https://x/clip.mp4')).toBe('video');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await detectMediaKind('https://x/photo.png')).toBe('image');
  });
});
