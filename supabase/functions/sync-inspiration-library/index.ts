import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireUserOrCron, corsHeaders } from "../_shared/auth.ts";

/**
 * sync-inspiration-library Edge Function
 *
 * Pulls all entries from the Notion Inspiration Library database and upserts
 * them into the `inspiration_entries` Supabase table.
 *
 * Notion database: e3c17222-2fdb-42f5-baab-0e0992eb396b
 *
 * Required Supabase secrets:
 *   NOTION_API_KEY  - Notion integration token (starts with "ntn_" or "secret_")
 *
 * To create a Notion integration token:
 *   1. Go to https://www.notion.so/profile/integrations
 *   2. Create a new integration for your workspace
 *   3. Copy the "Internal Integration Token"
 *   4. Share the Inspiration Library database with the integration
 *   5. Add the token as NOTION_API_KEY in Supabase → Project Settings → Secrets
 *
 * Designed to run:
 *   - Manually (call from Settings or admin panel)
 *   - On a weekly cron (low-churn data, weekly is plenty)
 *
 * Request body: (empty) — no params needed
 */

const NOTION_DB_ID = "e3c17222-2fdb-42f5-baab-0e0992eb396b";
const NOTION_API_VERSION = "2022-06-28";

// ── Notion property extractors ─────────────────────────────────────────────

function getText(prop: any): string {
  if (!prop) return "";
  if (prop.type === "title") return prop.title?.map((t: any) => t.plain_text).join("") || "";
  if (prop.type === "rich_text") return prop.rich_text?.map((t: any) => t.plain_text).join("") || "";
  if (prop.type === "url") return prop.url || "";
  return "";
}

function getSelect(prop: any): string {
  return prop?.select?.name || "";
}

function getMultiSelect(prop: any): string[] {
  return prop?.multi_select?.map((s: any) => s.name) || [];
}

function getNumber(prop: any): number {
  return prop?.number ?? 0;
}

function getDate(prop: any): string | null {
  return prop?.date?.start || null;
}

// Extract the 32-char hex ID from a Notion page URL or return the raw ID
function extractNotionId(pageId: string): string {
  // Notion IDs with dashes: 32b71a0a-b955-8103-a663-ca9dd12e8bd6
  // Without dashes: 32b71a0ab9558103a663ca9dd12e8bd6
  return pageId.replace(/-/g, "");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const notionKey = Deno.env.get("NOTION_API_KEY");

    // Inspiration library is a shared resource, not user-scoped, so any
    // authenticated user (or the cron runner) can trigger a refresh. We still
    // verify auth so this isn't trivially DoS-able from anyone with the
    // anon key.
    const supabaseAuth = createClient(supabaseUrl, supabaseKey);
    const body = await req.json().catch(() => ({}));
    const auth = await requireUserOrCron(req, supabaseAuth, body);
    if (!auth.ok) return auth.response;

    if (!notionKey) {
      throw new Error(
        "NOTION_API_KEY secret not set. Create a Notion integration at notion.so/profile/integrations, " +
        "share the Inspiration Library database with it, then add the token as NOTION_API_KEY in " +
        "Supabase → Project Settings → Secrets."
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Paginate through all Notion database entries ──────────────────────
    const allPages: any[] = [];
    let cursor: string | undefined = undefined;
    let pageCount = 0;

    do {
      const body: Record<string, any> = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;

      const notionRes = await fetch(
        `https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${notionKey}`,
            "Notion-Version": NOTION_API_VERSION,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      if (!notionRes.ok) {
        const errText = await notionRes.text();
        throw new Error(`Notion API error ${notionRes.status}: ${errText}`);
      }

      const notionData = await notionRes.json();
      allPages.push(...(notionData.results || []));
      cursor = notionData.has_more ? notionData.next_cursor : undefined;
      pageCount++;

      console.log(
        `Fetched page ${pageCount}: ${notionData.results?.length} entries` +
        (notionData.has_more ? `, more available (cursor: ${cursor})` : ", done")
      );
    } while (cursor);

    console.log(`Total entries fetched from Notion: ${allPages.length}`);

    // ── Map Notion pages → inspiration_entries rows ───────────────────────
    const rows = allPages.map((page: any) => {
      const props = page.properties || {};
      const notionId = extractNotionId(page.id);

      // Parse topic_tags — stored as multi_select in Notion
      const topicTags = getMultiSelect(props["Topic Tags"]);

      // Normalize platform to lowercase to match content_posts.platform convention
      const platformRaw = getSelect(props["Platform"]);
      const platform = platformRaw.toLowerCase() || "instagram";

      return {
        notion_id: notionId,
        post_title: getText(props["Post Title"]),
        platform,
        content_format: getSelect(props["Content Format"]),
        hook_framework: getSelect(props["Hook Framework"]),
        hook_text: getText(props["Hook Text"]),
        performance_tier: getSelect(props["Performance Tier"]),
        topic_tags: topicTags,
        tactical_notes: getText(props["Tactical Notes"]),
        creator: getText(props["Creator"]),
        source_url: getText(props["Source URL"]),
        likes: getNumber(props["Likes"]),
        views: getNumber(props["Views"]),
        comments: getNumber(props["Comments"]),
        duration: getText(props["Duration"]),
        status: getSelect(props["Status"]),
        date_analyzed: getDate(props["Date Analyzed"]),
        notion_url: page.url || "",
        synced_at: new Date().toISOString(),
      };
    });

    // ── Upsert in batches of 50 ───────────────────────────────────────────
    // Supabase upsert limit is generous but batching avoids any edge cases
    const BATCH_SIZE = 50;
    let upsertedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("inspiration_entries")
        .upsert(batch, { onConflict: "notion_id" });

      if (error) {
        console.error(`Batch ${i / BATCH_SIZE + 1} upsert error:`, error.message);
        errors.push(error.message);
      } else {
        upsertedCount += batch.length;
      }
    }

    // ── Build a summary for the response ─────────────────────────────────
    const tierCounts = rows.reduce((acc: Record<string, number>, r) => {
      const tier = r.performance_tier || "Unknown";
      acc[tier] = (acc[tier] || 0) + 1;
      return acc;
    }, {});

    const frameworkCounts = rows.reduce((acc: Record<string, number>, r) => {
      const fw = r.hook_framework || "Unknown";
      acc[fw] = (acc[fw] || 0) + 1;
      return acc;
    }, {});

    console.log(
      `Sync complete: ${upsertedCount}/${rows.length} entries upserted. ` +
      `Errors: ${errors.length}`
    );

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        totalFetched: allPages.length,
        upserted: upsertedCount,
        errors: errors.length > 0 ? errors : undefined,
        summary: {
          byPerformanceTier: tierCounts,
          byHookFramework: frameworkCounts,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("sync-inspiration-library error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
