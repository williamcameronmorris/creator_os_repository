// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { verifySvixSignature, signSvix, DEFAULT_TOLERANCE_SECONDS } from './webhookSignature.ts';

// A standard Svix-shaped secret: whsec_ + base64.
const SECRET = 'whsec_' + btoa('cliopatra-test-signing-key-32byte');
const BODY = JSON.stringify({ type: 'social.post.result.created', data: { post_id: 'sp_1' } });
const ID = 'msg_1';
const NOW_MS = 1_760_000_000_000;
const NOW_S = String(Math.floor(NOW_MS / 1000));

async function headerFor(ts: string, body = BODY, secret = SECRET) {
  return `v1,${await signSvix(secret, ID, ts, body)}`;
}

describe('verifySvixSignature', () => {
  it('accepts a fresh, correctly signed request', async () => {
    const res = await verifySvixSignature({
      secret: SECRET, rawBody: BODY, id: ID, timestamp: NOW_S,
      signatureHeader: await headerFor(NOW_S), nowMs: NOW_MS,
    });
    expect(res).toEqual({ ok: true });
  });

  it('accepts a match in any entry of a multi-signature header', async () => {
    const res = await verifySvixSignature({
      secret: SECRET, rawBody: BODY, id: ID, timestamp: NOW_S,
      signatureHeader: `v1,bm90LWl0 ${await headerFor(NOW_S)}`, nowMs: NOW_MS,
    });
    expect(res.ok).toBe(true);
  });

  it('rejects a validly signed request replayed outside the window', async () => {
    const old = String(Number(NOW_S) - DEFAULT_TOLERANCE_SECONDS - 1);
    const res = await verifySvixSignature({
      secret: SECRET, rawBody: BODY, id: ID, timestamp: old,
      signatureHeader: await headerFor(old), nowMs: NOW_MS,
    });
    expect(res).toEqual({ ok: false, reason: 'stale_timestamp' });
  });

  it('rejects a timestamp too far in the future', async () => {
    const future = String(Number(NOW_S) + DEFAULT_TOLERANCE_SECONDS + 1);
    const res = await verifySvixSignature({
      secret: SECRET, rawBody: BODY, id: ID, timestamp: future,
      signatureHeader: await headerFor(future), nowMs: NOW_MS,
    });
    expect(res).toEqual({ ok: false, reason: 'stale_timestamp' });
  });

  it('rejects a body that was changed after signing', async () => {
    const res = await verifySvixSignature({
      secret: SECRET, rawBody: BODY.replace('sp_1', 'sp_2'), id: ID, timestamp: NOW_S,
      signatureHeader: await headerFor(NOW_S), nowMs: NOW_MS,
    });
    expect(res).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a moved timestamp even inside the window', async () => {
    // Signed at NOW, presented with a different (still fresh) timestamp.
    const moved = String(Number(NOW_S) - 10);
    const res = await verifySvixSignature({
      secret: SECRET, rawBody: BODY, id: ID, timestamp: moved,
      signatureHeader: await headerFor(NOW_S), nowMs: NOW_MS,
    });
    expect(res).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a signature made with another secret', async () => {
    const res = await verifySvixSignature({
      secret: SECRET, rawBody: BODY, id: ID, timestamp: NOW_S,
      signatureHeader: await headerFor(NOW_S, BODY, 'whsec_' + btoa('some-other-key')), nowMs: NOW_MS,
    });
    expect(res).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('fails closed with no secret configured', async () => {
    const res = await verifySvixSignature({
      secret: undefined, rawBody: BODY, id: ID, timestamp: NOW_S,
      signatureHeader: await headerFor(NOW_S), nowMs: NOW_MS,
    });
    expect(res).toEqual({ ok: false, reason: 'no_secret' });
  });

  it('fails closed on missing headers and non-numeric timestamps', async () => {
    const sig = await headerFor(NOW_S);
    expect(await verifySvixSignature({ secret: SECRET, rawBody: BODY, id: null, timestamp: NOW_S, signatureHeader: sig, nowMs: NOW_MS }))
      .toEqual({ ok: false, reason: 'missing_headers' });
    expect(await verifySvixSignature({ secret: SECRET, rawBody: BODY, id: ID, timestamp: '2026-10-22T00:00:00Z', signatureHeader: sig, nowMs: NOW_MS }))
      .toEqual({ ok: false, reason: 'bad_timestamp' });
  });
});
