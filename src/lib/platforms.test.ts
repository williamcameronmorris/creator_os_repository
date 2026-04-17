import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getInstagramAuthUrl, getTikTokAuthUrl, getYouTubeAuthUrl } from './platforms';

vi.stubEnv('VITE_INSTAGRAM_APP_ID', 'ig_app_id');
vi.stubEnv('VITE_INSTAGRAM_REDIRECT_URI', 'https://example.com/cb');
vi.stubEnv('VITE_TIKTOK_CLIENT_KEY', 'tt_key');
vi.stubEnv('VITE_TIKTOK_REDIRECT_URI', 'https://example.com/tt');
vi.stubEnv('VITE_YOUTUBE_CLIENT_ID', 'yt_client_id');

beforeEach(() => {
  sessionStorage.clear();
});

describe('getInstagramAuthUrl', () => {
  it('points to Meta OAuth with the configured app_id + scopes', () => {
    const url = new URL(getInstagramAuthUrl());
    expect(url.origin + url.pathname).toBe('https://www.facebook.com/v25.0/dialog/oauth');
    expect(url.searchParams.get('client_id')).toBe('ig_app_id');
    expect(url.searchParams.get('redirect_uri')).toBe('https://example.com/cb');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toContain('instagram_basic');
    expect(url.searchParams.get('scope')).toContain('instagram_content_publish');
  });
});

describe('getTikTokAuthUrl', () => {
  it('points to TikTok v2 auth with the configured client_key', () => {
    const url = new URL(getTikTokAuthUrl());
    expect(url.origin + url.pathname).toBe('https://www.tiktok.com/v2/auth/authorize');
    expect(url.searchParams.get('client_key')).toBe('tt_key');
    expect(url.searchParams.get('redirect_uri')).toBe('https://example.com/tt');
    expect(url.searchParams.get('response_type')).toBe('code');
  });
});

describe('getYouTubeAuthUrl', () => {
  it('includes a CSRF state param that is persisted for later verification', () => {
    const url = new URL(getYouTubeAuthUrl());
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const state = url.searchParams.get('state');
    expect(state).toBeTruthy();
    expect(state!.length).toBeGreaterThanOrEqual(16);
    expect(sessionStorage.getItem('oauth_state_youtube')).toBe(state);
  });

  it('always uses the dedicated callback route (not the settings fallback)', () => {
    const url = new URL(getYouTubeAuthUrl());
    const redirect = url.searchParams.get('redirect_uri')!;
    expect(redirect.endsWith('/auth/youtube/callback')).toBe(true);
  });

  it('requests offline access + consent (needed for refresh_token)', () => {
    const url = new URL(getYouTubeAuthUrl());
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
  });

  it('requests the full YouTube scope set', () => {
    const url = new URL(getYouTubeAuthUrl());
    const scope = url.searchParams.get('scope')!;
    expect(scope).toContain('youtube.upload');
    expect(scope).toContain('yt-analytics.readonly');
  });
});
