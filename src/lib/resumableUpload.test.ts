import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));

import { storagePathFor } from './resumableUpload';

const fileOf = (name: string, size: number, lastModified = 1_700_000_000_000): File => {
  const f = new File(['x'], name, { lastModified });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

describe('storagePathFor', () => {
  it('is stable for the same file, so a resumed upload lands on the same object', () => {
    const a = storagePathFor('user-1', fileOf('launch.mov', 205_000_000));
    const b = storagePathFor('user-1', fileOf('launch.mov', 205_000_000));
    expect(a).toBe(b);
  });

  it('scopes the object to the user, which is what the storage policies check', () => {
    expect(storagePathFor('user-1', fileOf('clip.mp4', 10))).toMatch(/^user-1\//);
    expect(storagePathFor('user-2', fileOf('clip.mp4', 10))).toMatch(/^user-2\//);
  });

  it('separates files that differ in size or mtime but share a name', () => {
    const name = 'clip.mp4';
    const base = storagePathFor('u', fileOf(name, 100));
    expect(storagePathFor('u', fileOf(name, 200))).not.toBe(base);
    expect(storagePathFor('u', fileOf(name, 100, 1_700_000_000_001))).not.toBe(base);
  });

  it('keeps the extension so storage serves the right content type', () => {
    expect(storagePathFor('u', fileOf('a.MOV', 1))).toMatch(/\.mov$/);
    expect(storagePathFor('u', fileOf('a.jpeg', 1))).toMatch(/\.jpeg$/);
  });

  it('falls back to .bin when the file has no usable extension', () => {
    expect(storagePathFor('u', fileOf('noextension', 1))).toMatch(/\.bin$/);
  });
});
