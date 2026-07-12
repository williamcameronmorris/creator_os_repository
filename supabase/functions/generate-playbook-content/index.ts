import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireUserOrCron, corsHeaders } from "../_shared/auth.ts";
import { loadVoiceContext } from "../_shared/voice.ts";

/**
 * generate-playbook-content
 *
 * Fills the `body` of a pending playbook task (story_cta / story_results /
 * pin_comment) with ready-to-paste content in the creator's voice. The
 * playbook trigger creates tasks with body = NULL; the Today's Plays panel
 * shows a "Draft it" button that calls this function for one task at a time.
 *
 * Auth (deploy `--no-verify-jwt`, same as the other functions):
 *   - User mode: `Authorization: Bearer <user-jwt>`, body { taskId }.
 *     Counts against the caller's daily AI quota (same RPCs as
 *     generate-script).
 *   - Cron mode: body { cronSecret, userId, taskId } — matched against the
 *     Cron_Secret project secret via requireUserOrCron. System-generated,
 *     so it does NOT consume the user's quota (daily-brief precedent).
 *
 * Idempotent: if the task already has a body, it is returned as-is without
 * an AI call or a quota hit.
 */

const MODEL = "claude-sonnet-5";

/** Task types this function drafts content for. engage_window / first_check
 * are do-it-yourself tasks — nothing to pre-write. */
const DRAFTABLE = ["story_cta", "story_results", "pin_comment"] as const;
type DraftableType = (typeof DRAFTABLE)[number];

function taskInstructions(taskType: DraftableType): string {
  switch (taskType) {
    case "story_cta":
      return `Write a story that routes viewers to the main post. Include:
1. A 1-2 line story text that teases the main post without repeating its caption.
2. A poll question with exactly 2 punchy options (label them like "Poll: <question>" / "A: ..." / "B: ...") that farms engagement AND gives a clean reason to tap through to the main post.
Format the whole thing as plain text the creator can paste straight into the story composer.`;
    case "story_results":
      return `Write the follow-up story posted 23 hours later, right before the first story expires. Include:
1. A 1-line poll-results reveal (use a placeholder like "X%" for the winning side — the creator fills the real number).
2. A 1-line CTA routing viewers back to the main post before the story disappears.
Plain text, ready to paste.`;
    case "pin_comment":
      return `Write ONE comment the creator pins under their own video 24 hours after publishing. It should seed discussion: take a slightly spicy stance or ask a specific question tied to the video's topic, so replies compound. 1-3 sentences, plain text, no hashtags.`;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!anthropicKey) {
      throw new Error("ANTHROPIC_API_KEY secret not set. Add it in Supabase → Project Settings → Secrets.");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json().catch(() => ({}));
    const auth = await requireUserOrCron(req, supabase, body);
    if (!auth.ok) return auth.response;
    const userId = auth.userId;

    const taskId = typeof body.taskId === "string" ? body.taskId : "";
    if (!taskId) throw new Error("taskId is required");

    // ── Fetch the task (owner-scoped: id + user_id must both match) ─────────
    const { data: task, error: taskError } = await supabase
      .from("playbook_tasks")
      .select("id, user_id, content_post_id, platform, account_username, task_type, title, body, status")
      .eq("id", taskId)
      .eq("user_id", userId)
      .maybeSingle();

    if (taskError) throw new Error(`Failed to load task: ${taskError.message}`);
    if (!task) throw new Error("Task not found");
    if (task.status !== "pending") throw new Error("Task is no longer pending");
    if (!DRAFTABLE.includes(task.task_type as DraftableType)) {
      throw new Error(`Nothing to draft for a ${task.task_type} task`);
    }

    // Idempotent: already drafted — return it, no AI call, no quota hit.
    if (task.body && String(task.body).trim().length > 0) {
      return new Response(
        JSON.stringify({ success: true, body: task.body, cached: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Check quota (user mode only — cron is system-generated) ─────────────
    if (!auth.isCron) {
      const { data: quotaData, error: quotaError } = await supabase
        .rpc("check_and_reset_ai_quota", { p_user_id: userId });
      if (quotaError || !quotaData?.[0]) throw new Error("Failed to check AI quota");
      if (quotaData[0].requests_remaining <= 0) {
        throw new Error("Daily AI quota exceeded. Resets at midnight.");
      }
    }

    // ── Pull the main post + the creator's voice ─────────────────────────────
    let postCaption = "";
    let postTitle = "";
    if (task.content_post_id) {
      const { data: post } = await supabase
        .from("content_posts")
        .select("caption, title, platform, content_type")
        .eq("id", task.content_post_id)
        .maybeSingle();
      postCaption = (post?.caption || "").slice(0, 1500);
      postTitle = (post?.title || "").slice(0, 200);
    }

    const voiceContext = await loadVoiceContext(supabase, userId);

    // ── Build the prompt ─────────────────────────────────────────────────────
    const platform = task.platform || "instagram";
    const postBlock = postCaption || postTitle
      ? `The main post this task points back to:\n${postTitle ? `Title: ${postTitle}\n` : ""}${postCaption ? `Caption: ${postCaption}` : ""}`
      : "No caption available for the main post — keep the content topic-agnostic but specific in energy.";

    const userPrompt = `You are drafting one piece of post-publish protocol content for a ${platform} creator${task.account_username ? ` (@${task.account_username})` : ""}.

Task: ${task.title}
${postBlock}

${taskInstructions(task.task_type as DraftableType)}

Return ONLY a valid JSON object with this exact shape:
{ "body": "the ready-to-paste content as a single string (use \\n for line breaks)" }

No markdown fences. No explanation. Just the JSON object.`;

    // ── Call Claude ──────────────────────────────────────────────────────────
    // Same caching pattern as generate-script: base instructions + the
    // per-user voice fingerprint form a stable prefix, so the voice block
    // carries cache_control and repeat drafts within 5 minutes read it from
    // cache. thinking disabled; short max_tokens — these are 1-3 line drafts.
    const baseSystem =
      "You write short, punchy social content in the creator's own voice. Be specific, never generic. No emojis unless the voice profile says the creator uses them.";
    const system = voiceContext
      ? [
          { type: "text", text: baseSystem },
          { type: "text", text: voiceContext, cache_control: { type: "ephemeral" } },
        ]
      : baseSystem;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        thinking: { type: "disabled" },
        system,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error(`Claude API error: ${claudeRes.status} ${errText}`);
    }

    const claudeData = await claudeRes.json();
    if (claudeData.stop_reason === "max_tokens") {
      throw new Error("Draft was cut off before it finished. Please try again.");
    }
    const rawText = (claudeData.content?.[0]?.text || "").trim();

    // ── Parse STRICT JSON { body } (tolerate stray code fences) ─────────────
    let draft = "";
    try {
      const cleaned = rawText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      if (typeof parsed?.body === "string") draft = parsed.body.trim();
    } catch {
      // fall through to the empty-draft check below
    }
    if (!draft) throw new Error("Draft came back malformed. Please try again.");

    // ── Persist (guarded on user_id so a stale service-role write can never
    //    touch another user's row) ────────────────────────────────────────────
    const { error: updateError } = await supabase
      .from("playbook_tasks")
      .update({ body: draft })
      .eq("id", task.id)
      .eq("user_id", userId);
    if (updateError) throw new Error(`Failed to save draft: ${updateError.message}`);

    // ── Decrement quota (user mode only) ─────────────────────────────────────
    if (!auth.isCron) {
      await supabase.rpc("increment_ai_request", { p_user_id: userId });
    }

    return new Response(
      JSON.stringify({ success: true, body: draft }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("generate-playbook-content error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
