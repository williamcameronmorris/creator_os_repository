import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StatGrid } from './StatGrid';
import type { PublicKitPlatform } from '../../lib/mediaKit';

const platform = (over: Partial<PublicKitPlatform> = {}): PublicKitPlatform => ({
  platform: 'instagram',
  handle: 'cam',
  url: null,
  followers: 1000,
  followers_source: 'synced',
  followers_as_of: null,
  growth_30d_pct: null,
  engagement_rate: null,
  total_posts: null,
  median_views: 5000,
  as_of: null,
  ...over,
});

describe('StatGrid', () => {
  it('labels the typical-views number as a median', () => {
    const { container } = render(<StatGrid platforms={[platform()]} />);
    expect(container.textContent).toContain('MEDIAN VIEWS');
    expect(container.textContent).toContain('5K');
  });

  it('falls back to the old avg_views name when median_views is absent', () => {
    const p = { ...platform(), median_views: null, avg_views: 2500 } as PublicKitPlatform;
    const { container } = render(<StatGrid platforms={[p]} />);
    expect(container.textContent).toContain('2.5K');
  });

  it('warns that views are not comparable once two platforms show them', () => {
    const { container } = render(
      <StatGrid platforms={[platform(), platform({ platform: 'tiktok', median_views: 9000 })]} />
    );
    expect(container.textContent).toContain('comparable between platforms');
  });

  it('stays quiet when only one platform shows a views number', () => {
    const { container } = render(
      <StatGrid platforms={[platform(), platform({ platform: 'tiktok', median_views: null })]} />
    );
    expect(container.textContent).not.toContain('comparable between platforms');
  });
});
