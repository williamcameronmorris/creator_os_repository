import { describe, it, expect, vi, beforeEach } from 'vitest';

const createSignedUrls = vi.fn();
const getPublicUrl = vi.fn((path: string) => ({
  data: { publicUrl: `https://mlionhgievukulyufnnr.supabase.co/storage/v1/object/public/media/${path}` },
}));
vi.mock('./supabase', () => ({
  supabase: { storage: { from: () => ({ createSignedUrls, getPublicUrl }) } },
}));

import {
  mediaRef,
  mediaPathFromRef,
  isMediaRef,
  signMediaUrls,
  signMediaUrl,
  DISPLAY_TTL,
  PUBLISH_TTL,
} from './mediaUrls';

const UID = 'a90f537a-2d7c-4f7e-8e4b-7a0c7932655d';
const PATH = `${UID}/1726000000_ab12cd.mp4`;
const PUBLIC = `https://mlionhgievukulyufnnr.supabase.co/storage/v1/object/public/media/${PATH}`;
const SIGNED = `https://mlionhgievukulyufnnr.supabase.co/storage/v1/object/sign/media/${PATH}?token=abc`;
const PFM = 'https://cdn.postforme.dev/media/12345.mp4';

describe('mediaRef', () => {
  it('stores the bucket object URL, which the reader resolves back to the path', () => {
    const ref = mediaRef(PATH);
    expect(ref).toBe(PUBLIC);
    expect(mediaPathFromRef(ref)).toBe(PATH);
  });
});

describe('mediaPathFromRef', () => {
  it('reads the path out of a stored object URL', () => {
    expect(mediaPathFromRef(PUBLIC)).toBe(PATH);
  });
  it('reads the path out of a signed URL, dropping the token', () => {
    expect(mediaPathFromRef(SIGNED)).toBe(PATH);
  });
  it('accepts a bare bucket path that starts with a user id', () => {
    expect(mediaPathFromRef(PATH)).toBe(PATH);
  });
  it('decodes percent-encoded segments', () => {
    expect(mediaPathFromRef(PUBLIC.replace('ab12cd', 'a%20b'))).toBe(PATH.replace('ab12cd', 'a b'));
  });
  it('rejects anything that is not ours', () => {
    expect(mediaPathFromRef(PFM)).toBeNull();
    expect(mediaPathFromRef('')).toBeNull();
    expect(mediaPathFromRef(null)).toBeNull();
    expect(mediaPathFromRef(undefined)).toBeNull();
    expect(mediaPathFromRef('not-a-uuid/file.jpg')).toBeNull();
    expect(mediaPathFromRef('https://x.supabase.co/storage/v1/object/public/avatars/' + PATH)).toBeNull();
  });
  it('isMediaRef mirrors it', () => {
    expect(isMediaRef(PATH)).toBe(true);
    expect(isMediaRef(PFM)).toBe(false);
  });
});

describe('signMediaUrls', () => {
  beforeEach(() => createSignedUrls.mockReset());

  it('signs bucket references and passes foreign URLs through, keeping order', async () => {
    createSignedUrls.mockResolvedValue({
      data: [{ signedUrl: 'https://s/1' }, { signedUrl: 'https://s/2' }],
      error: null,
    });
    const out = await signMediaUrls([PFM, PATH, PUBLIC, '']);
    expect(out).toEqual([PFM, 'https://s/1', 'https://s/2', '']);
    expect(createSignedUrls).toHaveBeenCalledWith([PATH, PATH], DISPLAY_TTL);
  });

  it('does not call storage when nothing needs signing', async () => {
    const out = await signMediaUrls([PFM, null]);
    expect(out).toEqual([PFM, '']);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it('leaves references untouched when signing fails', async () => {
    createSignedUrls.mockResolvedValue({ data: null, error: { message: 'nope' } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await signMediaUrls([PATH])).toEqual([PATH]);
    warn.mockRestore();
  });

  it('uses the publish lifetime for a URL handed to a publisher', async () => {
    createSignedUrls.mockResolvedValue({ data: [{ signedUrl: 'https://s/p' }], error: null });
    expect(await signMediaUrl(PUBLIC, PUBLISH_TTL)).toBe('https://s/p');
    expect(createSignedUrls).toHaveBeenCalledWith([PATH], PUBLISH_TTL);
    expect(PUBLISH_TTL).toBe(86400);
  });
});
