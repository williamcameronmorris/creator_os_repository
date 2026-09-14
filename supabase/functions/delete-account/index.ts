// supabase/functions/delete-account/index.ts
//
// Deploy:
//   supabase functions deploy delete-account --no-verify-jwt
//
// We deploy with verify_jwt=false (per project convention) and verify the
// caller's bearer token inside the function using the SERVICE_ROLE key.
// This lets us perform privileged deletes (auth.users + every table that
// carries the user's rows + the user's storage prefix) after confirming the
// requester is the account owner.
//
// Order matters: child rows first, then brands (which cascade into the
// brand-only tables), then the profile, then storage, then the auth user.
// If any table delete fails for a reason other than "does not exist" we stop
// BEFORE touching auth.users and return the errors, so a half-deleted account
// is never left behind with no way to sign in and retry.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Every public table with a user_id column, children before parents. Built
// from the live schema on 2026-09-14; a table that has since been dropped is
// skipped ("does not exist" is not an error here), and a new user-scoped
// table must be added to this list.
const USER_TABLES = [
  // sync logs
  '_cowork_sync_run',
  '_nightly_sync_runs',
  // content and its children
  'content_post_metrics_daily',
  'post_analytics',
  'comments',
  'playbook_tasks',
  'content_workflow_stages',
  'content_posts',
  // April backup copy; dropped by 20260914000500, tolerated as missing after.
  'content_posts_backup_20260405',
  // AI
  'ai_content_suggestions',
  'ai_workflow_suggestions',
  'ai_daily_briefs',
  'ai_request_usage',
  'user_content_profiles',
  'saved_content_ideas',
  'suggested_times_cache',
  'daily_pulse_sessions',
  // challenge
  'challenge_progress',
  // deals (Patra) and its children
  'deal_activities',
  'deal_contracts',
  'deal_fit_checks',
  'deal_invoices',
  'deal_performance_reports',
  'deal_production_checklist',
  'deal_renewals',
  'deal_reports',
  'deal_stages',
  'deal_templates',
  'revenue_records',
  'deals',
  'brand_partnerships',
  'brand_prospect_activities',
  'brand_prospects',
  'copy_snippets',
  'default_snippet_favorites',
  // media kit
  'media_kit_leads',
  'media_kit_rates',
  'media_kits',
  // media, metrics, connections
  'media_library',
  'pfm_account_snapshots',
  'platform_metrics',
  'platform_credentials',
  'social_insights',
  'user_integrations',
  'tracked_creators',
];

// Tables keyed only by brand_id. They cascade from brands (migration
// 20260914000100_brand_fk_cascade.sql), but are cleared explicitly too so
// deletion completes even on a database where that migration is missing.
const BRAND_ONLY_TABLES = [
  'challenge_day_completions',
  'challenge_metrics',
  'brand_social_accounts',
];

// Every object a user can own lives under `<user id>/` in one of these.
const BUCKETS = ['media', 'avatars'];

type TableError = { table: string; message: string };

function isMissingTable(message: string): boolean {
  return /does not exist|could not find the table|schema cache/i.test(message);
}

/** Every object under `prefix/` in a bucket, walking folders. */
async function listObjects(admin: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  const stack = [prefix];
  while (stack.length) {
    const dir = stack.pop()!;
    let offset = 0;
    for (;;) {
      const { data, error } = await admin.storage.from(bucket).list(dir, { limit: 1000, offset });
      if (error) throw new Error(`${bucket}/${dir}: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const entry of data) {
        const path = `${dir}/${entry.name}`;
        // Folders come back with no id; files carry one.
        if (entry.id) out.push(path);
        else stack.push(path);
      }
      if (data.length < 1000) break;
      offset += data.length;
    }
  }
  return out;
}

async function purgeStorage(admin: SupabaseClient, userId: string): Promise<TableError[]> {
  const errors: TableError[] = [];
  for (const bucket of BUCKETS) {
    try {
      const paths = await listObjects(admin, bucket, userId);
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
        if (error) throw new Error(error.message);
      }
    } catch (e) {
      errors.push({ table: `storage:${bucket}`, message: (e as Error).message });
    }
  }
  return errors;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders,
    });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ ok: false, message: 'Missing bearer token' }, 401);
    }
    const accessToken = authHeader.slice('Bearer '.length);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userRes, error: userErr } = await admin.auth.getUser(accessToken);
    if (userErr || !userRes?.user) {
      return json({ ok: false, message: 'Invalid session' }, 401);
    }
    const userId = userRes.user.id;

    const errors: TableError[] = [];

    // ── 1. Rows keyed by user_id ───────────────────────────────────────────
    for (const table of USER_TABLES) {
      const { error } = await admin.from(table).delete().eq('user_id', userId);
      if (error && !isMissingTable(error.message)) {
        errors.push({ table, message: error.message });
      }
    }

    // ── 2. Rows keyed only by brand_id, then the brands themselves ─────────
    const { data: brands, error: brandsErr } = await admin
      .from('brands')
      .select('id')
      .eq('owner_id', userId);
    if (brandsErr) {
      errors.push({ table: 'brands', message: brandsErr.message });
    } else {
      const brandIds = (brands ?? []).map((b) => b.id as string);
      if (brandIds.length > 0) {
        for (const table of BRAND_ONLY_TABLES) {
          const { error } = await admin.from(table).delete().in('brand_id', brandIds);
          if (error && !isMissingTable(error.message)) {
            errors.push({ table, message: error.message });
          }
        }
        const { error } = await admin.from('brands').delete().in('id', brandIds);
        if (error) errors.push({ table: 'brands', message: error.message });
      }
    }

    // ── 3. Profile ─────────────────────────────────────────────────────────
    {
      const { error } = await admin.from('profiles').delete().eq('id', userId);
      if (error) errors.push({ table: 'profiles', message: error.message });
    }

    // Stop here if anything failed. The auth user still exists, so the
    // person can sign in, see the error, and try again.
    if (errors.length > 0) {
      return json(
        {
          ok: false,
          stage: 'tables',
          message: `Could not remove ${errors.map((e) => e.table).join(', ')}.`,
          errors,
        },
        500,
      );
    }

    // ── 4. Storage prefix ──────────────────────────────────────────────────
    const storageErrors = await purgeStorage(admin, userId);
    if (storageErrors.length > 0) {
      return json(
        {
          ok: false,
          stage: 'storage',
          message: 'Could not remove uploaded files.',
          errors: storageErrors,
        },
        500,
      );
    }

    // ── 5. Auth user ───────────────────────────────────────────────────────
    const { error: authDeleteErr } = await admin.auth.admin.deleteUser(userId);
    if (authDeleteErr) {
      return json(
        { ok: false, stage: 'auth.deleteUser', message: authDeleteErr.message },
        500,
      );
    }

    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, message: (e as Error).message }, 500);
  }
});
