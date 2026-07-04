import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireUser, corsHeaders } from "../_shared/auth.ts";
import { canonicalNiche } from "../_shared/niche.ts";

/**
 * watch-ensure-niche Edge Function
 *
 * Resolves the caller's Watch niche and guarantees it has discovered creators.
 *
 * profiles.niche_preference is free text ("Rock Guitar", "Guitar improvisation",
 * a whole paragraph, "Real Estate"...). We canonicalize it to a shared slug so
 * the guitar variants collapse onto one cached niche instead of each triggering
 * its own discovery. (A future upgrade: canonicalize with an LLM for niches the
 * keyword rules don't cover.)
 *
 * If the canonical niche has no creators yet, run discovery for it inline, then
 * report ready. User-authed (verifies the caller's JWT).
 */

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const auth = await requireUser(req, supabase);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("niche_preference")
      .eq("id", userId)
      .maybeSingle();

    const niche = canonicalNiche(profile?.niche_preference || "");
    if (!niche) return json({ niche: null, ready: false, needsNiche: true });

    const { count } = await supabase
      .from("suggested_creators")
      .select("id", { count: "exact", head: true })
      .eq("platform", "youtube")
      .eq("niche", niche);

    if ((count || 0) > 0) return json({ niche, ready: true });

    // No creators cached for this niche yet — discover them now (inline, so the
    // client can show a "finding creators" state and then load the feed). Bound
    // it with a timeout so a slow discovery returns a clear "not ready" instead
    // of hanging the request (and the client's spinner) indefinitely.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/watch-discovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ niche }),
        signal: ctrl.signal,
      });
      const result = await res.json();
      const first = Array.isArray(result?.niches) ? result.niches[0] : null;
      const ready = !!first && (first.creators || 0) > 0;
      return json({ niche, ready, discovered: first ?? null });
    } catch {
      // Timed out or discovery failed — the cron will fill this niche later.
      return json({ niche, ready: false, discovering: true });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return json({ niche: null, ready: false, error: (error as Error).message }, 500);
  }
});
