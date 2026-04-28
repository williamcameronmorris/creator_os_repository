import { supabase } from './supabase';

export interface PostForMeAccount {
  id: string;
  platform: string;
  username?: string | null;
  profilePhotoUrl?: string | null;
  status?: 'connected' | 'disconnected';
  externalId?: string | null;
}

export interface PostForMeState {
  accounts: PostForMeAccount[];
}

export const POSTFORME_PLATFORMS = [
  { id: 'tiktok', name: 'TikTok' },
  { id: 'instagram', name: 'Instagram' },
  { id: 'facebook', name: 'Facebook' },
  { id: 'youtube', name: 'YouTube' },
  { id: 'x', name: 'X / Twitter' },
  { id: 'threads', name: 'Threads' },
  { id: 'linkedin', name: 'LinkedIn' },
] as const;

export type PostForMePlatformId = typeof POSTFORME_PLATFORMS[number]['id'];

interface ProxyEnvelope<T> {
  status: number;
  data: T;
}

async function proxy<T>(method: string, path: string, body?: unknown, query?: Record<string, string | string[]>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<ProxyEnvelope<T>>('postforme-proxy', {
    body: { method, path, body, query },
  });
  if (error) throw new Error(error.message || 'postforme-proxy invocation failed');
  if (!data) throw new Error('Empty response from postforme-proxy');
  if (data.status >= 400) {
    const msg = (data.data && typeof data.data === 'object' && 'message' in (data.data as object))
      ? String((data.data as { message: unknown }).message)
      : `Post for Me ${data.status}`;
    throw new Error(msg);
  }
  return data.data;
}

function normalizeAccount(raw: any): PostForMeAccount {
  return {
    id: raw.id,
    platform: raw.platform,
    username: raw.username ?? null,
    profilePhotoUrl: raw.profile_photo_url ?? null,
    status: raw.status,
    externalId: raw.external_id ?? null,
  };
}

export async function listPostForMeAccounts(_userId: string, _refresh = false): Promise<PostForMeState> {
  const data = await proxy<{ data?: any[] } | any[]>('GET', '/v1/social-accounts');
  const arr = Array.isArray(data) ? data : (data?.data || []);
  return { accounts: arr.map(normalizeAccount) };
}

export async function initPostForMeConnect(
  _userId: string,
  platform: PostForMePlatformId,
  redirectUrl?: string,
): Promise<{ authUrl: string }> {
  const body: Record<string, unknown> = { platform, permissions: ['posts', 'feeds'] };
  if (redirectUrl) body.redirect_url_override = redirectUrl;
  const data = await proxy<{ url: string }>('POST', '/v1/social-accounts/auth-url', body);
  if (!data?.url) throw new Error('No url returned from auth-url');
  return { authUrl: data.url };
}

export async function disconnectPostForMeAccount(
  _userId: string,
  accountId: string,
): Promise<{ accounts: PostForMeAccount[] }> {
  await proxy('POST', `/v1/social-accounts/${accountId}/disconnect`);
  const state = await listPostForMeAccounts(_userId, true);
  return { accounts: state.accounts };
}

export interface CreatePostInput {
  caption: string;
  mediaUrls: string[];
  socialAccountIds: string[];
  scheduledAt?: string;
}

export interface PostForMePost {
  id: string;
  status?: string;
  scheduled_at?: string | null;
}

export async function createPostForMePost(input: CreatePostInput): Promise<PostForMePost> {
  const body: Record<string, unknown> = {
    caption: input.caption,
    social_accounts: input.socialAccountIds,
  };
  if (input.mediaUrls.length > 0) {
    body.media = input.mediaUrls.map((url) => ({ url }));
  }
  if (input.scheduledAt) body.scheduled_at = input.scheduledAt;
  return proxy<PostForMePost>('POST', '/v1/social-posts', body);
}

export function findPostForMeAccount(accounts: PostForMeAccount[], platform: string): PostForMeAccount | undefined {
  return accounts.find((a) => a.platform === platform && a.status !== 'disconnected');
}
