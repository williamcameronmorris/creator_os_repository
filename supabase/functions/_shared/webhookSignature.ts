/**
 * Svix-style webhook signature verification (Post for Me signs this way).
 *
 * Signed content is `${id}.${timestamp}.${rawBody}`, HMAC-SHA256, base64,
 * delivered as a space-separated `v1,<sig> v2,<sig>` header alongside
 * `webhook-id` and `webhook-timestamp`. The secret carries a `whsec_` prefix
 * and isn't standard-length base64, so we can't be sure PFM base64-decodes the
 * key or signs with the raw string. A match under EITHER interpretation is
 * accepted; both are secret-gated, so neither is forgeable without it.
 *
 * The timestamp is inside the signed content, so checking it is what stops a
 * captured request from being replayed later: outside the tolerance window the
 * request is rejected even with a valid signature.
 *
 * Fails CLOSED: no secret, a missing header or an unparseable timestamp is a
 * rejection.
 */

export const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

export type SignatureCheck =
  | { ok: true }
  | { ok: false; reason: "no_secret" | "missing_headers" | "bad_timestamp" | "stale_timestamp" | "bad_signature" };

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacBase64(keyBytes: Uint8Array, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/** Candidate signing keys: base64-decoded (standard Svix) and raw. */
function keyCandidates(secret: string): Uint8Array[] {
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const keys: Uint8Array[] = [];
  try {
    keys.push(Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)));
  } catch {
    // not valid base64: skip this interpretation
  }
  keys.push(new TextEncoder().encode(raw));
  return keys;
}

export async function signSvix(secret: string, id: string, timestamp: string, rawBody: string): Promise<string> {
  return await hmacBase64(keyCandidates(secret)[0], `${id}.${timestamp}.${rawBody}`);
}

export async function verifySvixSignature(opts: {
  secret: string | undefined | null;
  rawBody: string;
  id: string | null;
  timestamp: string | null;
  signatureHeader: string | null;
  nowMs?: number;
  toleranceSeconds?: number;
}): Promise<SignatureCheck> {
  const { secret, rawBody, id, timestamp, signatureHeader } = opts;
  if (!secret) return { ok: false, reason: "no_secret" };
  if (!id || !timestamp || !signatureHeader) return { ok: false, reason: "missing_headers" };

  // Svix timestamps are integer seconds since the epoch.
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: "bad_timestamp" };
  const tsSeconds = Number(timestamp);
  const nowSeconds = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  const tolerance = opts.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - tsSeconds) > tolerance) return { ok: false, reason: "stale_timestamp" };

  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected: string[] = [];
  for (const key of keyCandidates(secret)) expected.push(await hmacBase64(key, signedContent));

  const provided = signatureHeader.split(" ").map((part) => {
    const comma = part.indexOf(",");
    return comma >= 0 ? part.slice(comma + 1) : part;
  });

  for (const sig of provided) {
    for (const exp of expected) {
      if (constantTimeEqual(sig, exp)) return { ok: true };
    }
  }
  return { ok: false, reason: "bad_signature" };
}
