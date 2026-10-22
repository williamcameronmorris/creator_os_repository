import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { reserveAiRequest, QuotaError } from './quota.ts';

function fakeSupabase(reserveResult: { data: unknown; error: unknown }, refundError: unknown = null) {
  const rpc = vi.fn(async (name: string) =>
    name === 'increment_ai_request' ? reserveResult : { data: null, error: refundError });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('reserveAiRequest', () => {
  it('returns a refund that hands the request back exactly once', async () => {
    const { client, rpc } = fakeSupabase({ data: true, error: null });
    const refund = await reserveAiRequest(client, 'u1');
    await refund();
    await refund();
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['increment_ai_request', 'refund_ai_request']);
    expect(rpc).toHaveBeenLastCalledWith('refund_ai_request', { p_user_id: 'u1' });
  });

  it('throws an exceeded QuotaError at the limit', async () => {
    const { client } = fakeSupabase({ data: false, error: null });
    await expect(reserveAiRequest(client, 'u1')).rejects.toMatchObject({ name: 'QuotaError', exceeded: true });
  });

  it('throws a non-exceeded QuotaError when the check itself fails', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'boom' } });
    const err = await reserveAiRequest(client, 'u1').catch((e) => e);
    expect(err).toBeInstanceOf(QuotaError);
    expect(err.exceeded).toBe(false);
  });

  it('never throws from a failed refund', async () => {
    const { client } = fakeSupabase({ data: true, error: null }, { message: 'refund failed' });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const refund = await reserveAiRequest(client, 'u1');
    await expect(refund()).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
