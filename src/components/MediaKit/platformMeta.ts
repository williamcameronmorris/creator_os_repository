import { Instagram, Youtube, Facebook, Twitter, Cloud, AtSign, Sparkles } from 'lucide-react';
import type { ElementType } from 'react';

// Same icon set as the account switcher, so a platform looks the same to a
// brand on the public page as it does to the creator inside the app.
export const PLATFORM_ICONS: Record<string, ElementType> = {
  instagram: Instagram,
  youtube: Youtube,
  facebook: Facebook,
  x: Twitter,
  tiktok: Sparkles,
  threads: AtSign,
  bluesky: Cloud,
};

export const PLATFORM_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
  x: 'X',
  tiktok: 'TikTok',
  threads: 'Threads',
  bluesky: 'Bluesky',
};

export function platformLabel(p: string): string {
  return PLATFORM_LABEL[p] ?? p.charAt(0).toUpperCase() + p.slice(1);
}
