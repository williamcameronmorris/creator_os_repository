import { describe, it, expect } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { PostGrid } from './PostGrid';
import type { PublicKitPost } from '../../lib/mediaKit';

const post = (n: number, platform = 'instagram'): PublicKitPost => ({
  platform,
  thumbnail_url: `https://cdn.example/${n}.jpg`,
  permalink: null,
  published_at: null,
  metric_label: 'views',
  metric_value: 1000 - n,
});

describe('PostGrid', () => {
  it('shows only `limit` tiles even when more candidates arrive', () => {
    const { container } = render(<PostGrid posts={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => post(n))} limit={6} />);
    expect(container.querySelectorAll('img')).toHaveLength(6);
  });

  it('drops a tile whose thumbnail fails and backfills from the spares', () => {
    const { container } = render(<PostGrid posts={[1, 2, 3, 4].map((n) => post(n))} limit={3} />);
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(3);
    fireEvent.error(imgs[0]);
    const after = Array.from(container.querySelectorAll('img')).map((i) => i.getAttribute('src'));
    expect(after).toHaveLength(3);
    expect(after).not.toContain('https://cdn.example/1.jpg');
    expect(after).toContain('https://cdn.example/4.jpg');
  });

  it('renders nothing when there are no posts', () => {
    const { container } = render(<PostGrid posts={[]} limit={6} />);
    expect(container.innerHTML).toBe('');
  });
});
