import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * classify-posts
 *
 * Assigns each of the creator's own published posts a CONTENT LANE from
 * `content_lanes` — the same 6-way taxonomy that was previously only
 * ever applied to competitor content via `inspiration_analyses`.
 *
 * Why: `post_performance` benchmarks a post against the creator's trailing
 * median for the same (platform, format). Without an lane it falls back to
 * (platform, media_type), which is coarse. With one, "8,400 views" becomes
 * "2.1x your Contrarian Reframe median", and the lane's own
 * `replication_playbook` becomes the answer to "what should I make next".
 *
 * Deliberately caption + metadata only. The `inspiration_analyses` pipeline
 * does frame-level video analysis; that is expensive and built for tearing down
 * a handful of competitor posts, not for classifying hundreds of your own.
 *
 * Posts that fit no lane are left NULL on purpose. The six lanes were
 * derived from short-form video, so Threads text posts and stills often will
 * not fit. A null falls back to media_type grouping, which is correct. Forcing
 * a bad fit would corrupt the very medians this exists to compute.
 *
 * Auth: `{ cronSecret }` in the body, or a user session JWT.
 * Body: { cronSecret?, userId?, limit?, force? }
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const CRON_SECRET = Deno.env.get("Cron_Secret");
const DEFAULT_PFM_USER_ID = Deno.env.get("Default_PFM_User_Id");

/** Posts per Claude call. Keeps each request well inside the token budget. */
const BATCH_SIZE = 25;
/** Below this, store nothing. A wrong lane is worse than no lane. */
const CONFIDENCE_FLOOR = 0.5;
const CAPTION_CHARS = 400;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Lane {
  id: string;
  slug: string;
  name: string;
  think_of: string | null;
  definition: string;
}

interface PostRow {
  id: string;
  platform: string;
  media_type: string | null;
  caption: string | null;
  title: string | null;
}

const SYSTEM_PROMPT = `You sort a creator's own social posts into content lanes.

You are given a numbered list of lanes and a numbered list of posts. For each
post, pick the lane that best describes what the post is DOING for the viewer.

Rules:
- These five lanes are designed to cover any niche, so nearly every post fits
  one. Do not treat the example creators as the subject matter; a guitar post
  can be Education, a Review, or Entertainment just as easily as a tech post.
- Judge the job the content does, not its topic. "Here is a rare Les Paul and
  why the pickups matter" is a Review. "Peter Green got his tone from an
  out-of-phase Les Paul" is Education. "How many guitars does a player need?
  One. Just kidding" is Entertainment.
- Use lane 0 ("no fit") only for posts with genuinely no discernible job, such
  as a bare link drop or an empty caption. This should be rare.
- Confidence is 0 to 1, reflecting how clearly the caption supports the lane.

Respond with JSON only, no prose, in exactly this shape:
{"classifications":[{"i":1,"lane":3,"confidence":0.82}]}
Include one entry for every post you were given, using its given number as "i".`;

function buildUserPrompt(lanes: Lane[], posts: PostRow[]): string {
  const laneBlock = lanes
    .map((l, idx) =>
      `${idx + 1}. ${l.name}${l.think_of ? ` (think: ${l.think_of})` : ""}\n   ${l.definition}`,
    )
    .join("\n\n");

  const postBlock = posts
    .map((p, idx) => {
      const text = (p.title || p.caption || "").replace(/\s+/g, " ").trim().slice(0, CAPTION_CHARS);
      return `${idx + 1}. [${p.platform} / ${p.media_type || "unknown"}] ${text || "(no caption)"}`;
    })
    .join("\n");

  return `LANES\n\n${laneBlock}\n\n0. No fit - no discernible job (bare link, empty caption).\n\nPOSTS\n\n${postBlock}`;
}

async function classifyBatch(
  lanes: Lane[],
  posts: PostRow[],
): Promise<{ id: string; lane_id: string | null; confidence: number }[]> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(lanes, posts) }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const rawText: string = data.content?.[0]?.text || "{}";
  // Claude occasionally wraps JSON in a fence despite the instruction.
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let parsed: { classifications?: { i: number; lane: number; confidence: number }[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Unparseable classifier output: ${cleaned.slice(0, 200)}`);
  }

  const out: { id: string; lane_id: string | null; confidence: number }[] = [];
  for (const c of parsed.classifications || []) {
    const post = posts[c.i - 1];
    if (!post) continue;
    const confidence = typeof c.confidence === "number" ? c.confidence : 0;
    // lane 0 means "no fit", which we store as null.
    const lane = lanes[c.lane - 1];
    const good = lane && c.lane > 0 && confidence >= CONFIDENCE_FLOOR;
    out.push({
      id: post.id,
      lane_id: good ? lane.id : null,
      confidence,
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { cronSecret?: string; userId?: string; limit?: number; force?: boolean } = {};
  try {
    const raw = await req.text();
    if (raw) body = JSON.parse(raw);
  } catch { /* empty body is fine */ }

  let userId: string | null = null;
  if (body.cronSecret && CRON_SECRET && body.cronSecret === CRON_SECRET) {
    userId = body.userId || DEFAULT_PFM_USER_ID || null;
    if (!userId) return json({ error: "Cron mode requires userId or Default_PFM_User_Id" }, 500);
  } else {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Missing bearer token" }, 401);
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await admin.auth.getUser(authHeader.slice(7));
    if (error || !data?.user) return json({ error: "Invalid session" }, 401);
    userId = data.user.id;
  }

  if (!ANTHROPIC_API_KEY) return json({ error: "Missing ANTHROPIC_API_KEY" }, 500);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: lanes, error: laneErr } = await supabase
    .from("content_lanes")
    .select("id, slug, name, think_of, definition")
    .order("sort_order");
  if (laneErr || !lanes?.length) {
    return json({ error: `Could not load lanes: ${laneErr?.message ?? "none found"}` }, 500);
  }

  // Only classify posts the benchmark will actually use: published, and
  // refreshed by postforme-sync in the last 7 days (the same freshness test
  // post_performance applies, which excludes legacy rows with incompatible
  // metric definitions).
  const { data: freshRows, error: freshErr } = await supabase
    .from("content_post_metrics_daily")
    .select("post_id")
    .gte("snapshot_date", new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  if (freshErr) return json({ error: `fresh lookup: ${freshErr.message}` }, 500);
  const freshIds = [...new Set((freshRows || []).map((r) => r.post_id as string))];
  if (freshIds.length === 0) return json({ classified: 0, note: "no freshly-synced posts" });

  let query = supabase
    .from("content_posts")
    .select("id, platform, media_type, caption, title")
    .eq("user_id", userId)
    .eq("status", "published")
    .in("id", freshIds)
    .order("published_at", { ascending: false })
    .limit(body.limit ?? 500);
  if (!body.force) query = query.is("lane_id", null);

  const { data: posts, error: postsErr } = await query;
  if (postsErr) return json({ error: `posts lookup: ${postsErr.message}` }, 500);
  if (!posts?.length) return json({ classified: 0, note: "nothing left to classify" });

  let classified = 0;
  let assigned = 0;
  let noFit = 0;
  const errors: string[] = [];

  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE) as PostRow[];
    try {
      const results = await classifyBatch(lanes as Lane[], batch);
      for (const r of results) {
        const { error } = await supabase
          .from("content_posts")
          .update({ lane_id: r.lane_id, lane_confidence: r.confidence })
          .eq("id", r.id)
          .eq("user_id", userId);
        if (error) {
          errors.push(`update ${r.id}: ${error.message}`);
          continue;
        }
        classified++;
        if (r.lane_id) assigned++;
        else noFit++;
      }
    } catch (err) {
      errors.push(`batch ${i / BATCH_SIZE}: ${(err as Error).message}`);
    }
  }

  return json({
    userId,
    candidates: posts.length,
    classified,
    assigned,
    noFit,
    errors: errors.slice(0, 10),
  });
});
