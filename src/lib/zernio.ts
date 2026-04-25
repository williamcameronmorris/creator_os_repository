/**
 * Client helpers for the Zernio integration edge functions.
 * Wraps supabase.functions.invoke calls with typed responses.
 */
import { supabase } from './supabase';

export interface ZernioAccount {
  id: string;            // normalized — falls back to _id
  _id?: string;
  platform: string;      // 'tiktok' | 'instagram' | 'facebook' | 'youtube' | 'twitter' | 'threads' | 'linkedin' | 'pinterest' | etc.
  username?: string;
  displayName?: string;
  isActive?: boolean;
  profileImage?: string;
}

export interface ZernioState {
  profileId: string | null;
  accounts: ZernioAccount[];
}

export const ZERNIO_PLATFORMS = [
  { id: 'tiktok', name: 'TikTok' },
  { id: 'instagram', name: 'Instagram' },
  { id: 'facebook', name: 'Facebook' },
  { id: 'youtube', name: 'YouTube' },
  { id: 'twitter', name: 'X / Twitter' },
  { id: 'threads', name: 'Threads' },
  { id: 'linkedin', name: 'LinkedIn' },
] as const;

export type ZernioPlatformId = typeof ZERNIO_PLATFORMS[number]['id'];

export async function listZernioAccounts(userId: string, refresh = false): Promise<ZernioState> {
  const { data, error } = await supabase.functions.invoke('zernio-list-accounts', {
    body: { userId, refresh },
  });
  if (error) throw new Error(error.message || 'Failed to list Zernio accounts');
  return {
    profileId: data?.profileId ?? null,
    accounts: Array.isArray(data?.accounts) ? data.accounts : [],
  };
}

export async function initZernioConnect(userId: string, platform: ZernioPlatformId): Promise<{ authUrl: string; profileId: string }> {
  const { data, error } = await supabase.functions.invoke('zernio-connect-init', {
    body: { userId, platform },
  });
  if (error) throw new Error(error.message || 'Failed to initiate Zernio connect');
  if (!data?.authUrl) throw new Error('No authUrl returned');
  return { authUrl: data.authUrl, profileId: data.profileId };
}

export async function completeZernioConnect(params: {
  userId: string;
  platform: string;
  code: string;
  state: string;
}): Promise<{ accounts: ZernioAccount[] }> {
  const { data, error } = await supabase.functions.invoke('zernio-connect-callback', {
    body: params,
  });
  if (error) throw new Error(error.message || 'Failed to complete Zernio connect');
  if (data?.error) throw new Error(data.error);
  return { accounts: Array.isArray(data?.accounts) ? data.accounts : [] };
}

export async function disconnectZernioAccount(userId: string, accountId: string): Promise<{ accounts: ZernioAccount[] }> {
  const { data, error } = await supabase.functions.invoke('zernio-disconnect', {
    body: { userId, accountId },
  });
  if (error) throw new Error(error.message || 'Failed to disconnect Zernio account');
  if (data?.error) throw new Error(data.error);
  return { accounts: Array.isArray(data?.accounts) ? data.accounts : [] };
}

/**
 * Returns the Zernio account connected for a specific platform, if any.
 * Useful for ComposePost when checking which platforms are available.
 */
export function findZernioAccount(accounts: ZernioAccount[], platform: string): ZernioAccount | undefined {
  return accounts.find((a) => a.platform === platform && a.isActive !== false);
}
