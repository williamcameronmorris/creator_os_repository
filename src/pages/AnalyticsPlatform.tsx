import { Link } from 'react-router-dom';
import { ArrowLeft, Youtube, Instagram } from 'lucide-react';

interface PlatformPageProps {
  platform: 'youtube' | 'instagram' | 'tiktok';
}

const PLATFORM_META = {
  youtube: {
    label: 'YouTube',
    Icon: Youtube,
    pitch:
      'Subscribers gained, watch time, average view duration, and retention by video. Pulled from the YouTube Analytics API on each sync.',
  },
  instagram: {
    label: 'Instagram',
    Icon: Instagram,
    pitch:
      'Reach, impressions, saves, shares, and per-Reel video views. Pulled from the Instagram Graph API on each sync.',
  },
  tiktok: {
    label: 'TikTok',
    Icon: TikTokIcon,
    pitch:
      'Average watch time, video views by source, and follower-to-view ratio. Pulled from the TikTok Display API on each sync.',
  },
} as const;

/**
 * Per-platform deep-dive page. Currently a stub for v1 — the cross-platform
 * Analytics page covers the aggregate view; these routes exist so Cam can wire
 * navigation tiles into Office and so we can flesh out platform-native metrics
 * (the things the cross-network view can't show) one network at a time.
 */
export function AnalyticsPlatform({ platform }: PlatformPageProps) {
  const meta = PLATFORM_META[platform];
  const Icon = meta.Icon;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Link
        to="/analytics"
        className="t-micro text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
      >
        <ArrowLeft className="w-3 h-3" />
        Back to Profile Performance
      </Link>

      <div>
        <p className="t-micro text-muted-foreground mb-2">Per-network deep dive</p>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight flex items-center gap-3">
          <Icon className="w-8 h-8 text-foreground" />
          {meta.label} Performance
        </h1>
      </div>

      <section className="border border-border bg-card p-8 text-center space-y-3">
        <Icon className="w-12 h-12 mx-auto text-muted-foreground/40" strokeWidth={1.5} />
        <h2 className="text-lg font-semibold">Coming next</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">{meta.pitch}</p>
        <Link
          to="/analytics"
          className="t-micro border border-foreground bg-foreground text-primary-foreground inline-block px-3 py-2 hover:bg-accent hover:border-accent hover:text-accent-foreground transition-colors mt-3"
        >
          See cross-platform analytics
        </Link>
      </section>
    </div>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  // lucide-react@0.344.0 doesn't ship a TikTok glyph; inline SVG matches the
  // weight of Instagram/Youtube icons used elsewhere in this page.
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </svg>
  );
}
