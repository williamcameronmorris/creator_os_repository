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

/**
 * Multi-tenancy note:
 * The postforme-proxy edge function auto-injects `external_id={user.id}` into
 * the query for GET requests and into the body for create-account / create-post
 * requests. So this client only has to pass `external_id` for the operations
 * where it materially matters (creating an account, creating a post) — list
 * filtering happens server-side from the JWT and isn't trusted from this code.
 */

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
  // Proxy auto-filters by the authenticated user's external_id.
  const data = await proxy<{ data?: any[] } | any[]>('GET', '/v1/social-accounts');
  const arr = Array.isArray(data) ? data : (data?.data || []);
  return { accounts: arr.map(normalizeAccount) };
}

/**
 * Per-platform extra data PFM requires when initiating OAuth.
 *
 *   instagram → connection_type: 'instagram' (default) means "Log in with
 *               Instagram" (direct, recommended for personal IG creators).
 *               Use 'facebook' if the IG is linked to a Facebook Page and the
 *               creator wants the Page-based flow.
 *
 * Other platforms don't currently require `platform_data` — added cases as we
 * encounter them.
 */
function buildPlatformData(platform: PostForMePlatformId): Record<string, unknown> | undefined {
  switch (platform) {
    case 'instagram':
      return { instagram: { connection_type: 'instagram' } };
    default:
      return undefined;
  }
}

export async function initPostForMeConnect(
  userId: string,
  platform: PostForMePlatformId,
  redirectUrl?: string,
): Promise<{ authUrl: string }> {
  // Tag the new account with this user's id so it scopes correctly in
  // multi-tenant listings + sync. Proxy will enforce/override this from JWT
  // server-side but we also send it explicitly for clarity.
  const body: Record<string, unknown> = {
    platform,
    permissions: ['posts', 'feeds'],
    external_id: userId,
  };
  const platformData = buildPlatformData(platform);
  if (platformData) body.platform_data = platformData;
  if (redirectUrl) body.redirect_url_override = redirectUrl;
  const data = await proxy<{ url: string }>('POST', '/v1/social-accounts/auth-url', body);
  if (!data?.url) throw new Error('No url returned from auth-url');
  return { authUrl: data.url };
}

export async function disconnectPostForMeAccount(
  userId: string,
  accountId: string,
): Promise<{ accounts: PostForMeAccount[] }> {
  await proxy('POST', `/v1/social-accounts/${accountId}/disconnect`);
  const state = await listPostForMeAccounts(userId, true);
  return { accounts: state.accounts };
}

export interface CreatePostInput {
  userId: string;
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
  // Tag the post with this user's id for multi-tenant scoping.
  const body: Record<string, unknown> = {
    caption: input.caption,
    social_accounts: input.socialAccountIds,
    external_id: input.userId,
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
