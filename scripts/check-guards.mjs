#!/usr/bin/env node
/**
 * Structural guards that CI enforces, so the rules below don't depend on
 * anyone remembering them. Each guard prints its violations; any violation
 * fails the run.
 *
 *   node scripts/check-guards.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

const rel = (p) => relative(ROOT, p);
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

// The OAuth token columns on profiles. They are not granted to the app
// (migration 20261022120100_lock_down_platform_tokens.sql).
const TOKEN_COLUMNS = [
  'instagram_access_token', 'youtube_access_token', 'youtube_refresh_token',
  'facebook_page_access_token', 'meta_access_token', 'threads_access_token',
  'tiktok_access_token',
];

const guards = [];

/**
 * profiles: no `select('*')` anywhere (app or edge functions), and the app
 * never names a token column. In the app a star select fails outright under
 * the column grants; in an edge function it runs on the service role and
 * returns every token, so a star select on a public path leaks them.
 */
guards.push(function profilesSelects() {
  const problems = [];
  const files = [
    ...walk(join(ROOT, 'src'), ['.ts', '.tsx']),
    ...walk(join(ROOT, 'supabase/functions'), ['.ts']),
  ].filter((f) => !/\.test\.tsx?$/.test(f));
  const fromProfiles = /\.from\(\s*["']profiles["']\s*\)/g;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(fromProfiles)) {
      // Look at this query's chain only: up to the next .from( or 400 chars.
      const rest = text.slice(m.index + m[0].length, m.index + m[0].length + 400);
      const chain = rest.split(/\.from\(/)[0];
      const sel = chain.match(/\.select\(\s*(["'`]\s*\*\s*["'`])?\s*\)/);
      if (sel && (sel[1] || /\.select\(\s*\)/.test(sel[0]))) {
        problems.push(`${rel(file)}:${lineOf(text, m.index)} selects every column of profiles; name the columns (src: PROFILE_COLUMNS)`);
      }
    }
    if (file.startsWith(join(ROOT, 'src'))) {
      for (const col of TOKEN_COLUMNS) {
        // has_youtube_refresh_token is the readable flag, not the token.
        const idx = text.search(new RegExp(`(?<![A-Za-z0-9_])${col}\\b`));
        if (idx >= 0) problems.push(`${rel(file)}:${lineOf(text, idx)} names ${col}; tokens are server-only`);
      }
    }
  }
  return { name: 'profiles selects', problems };
});

/**
 * Edge function auth: every function authenticates through _shared/auth.ts.
 * A function must call one of its helpers, or declare `@auth-exempt: <why>`
 * (signed webhooks with no caller identity). Rolling a check inline, by
 * calling auth.getUser or comparing a bearer to the service key, fails: that
 * is how functions once ended up trusting a body-supplied userId.
 */
guards.push(function edgeFunctionAuth() {
  const problems = [];
  const dir = join(ROOT, 'supabase/functions');
  const HELPERS = /\b(requireUser|requireUserOrCron|requireService|requireServiceOrCron|optionalUser)\(/;
  for (const name of readdirSync(dir)) {
    const entry = join(dir, name, 'index.ts');
    if (name.startsWith('_') || !statSync(join(dir, name)).isDirectory()) continue;
    let text;
    try { text = readFileSync(entry, 'utf8'); } catch { continue; }
    const exempt = /@auth-exempt:\s*\S/.test(text);
    if (!exempt && !HELPERS.test(text)) {
      problems.push(`${rel(entry)} has no auth: call a _shared/auth.ts helper or declare @auth-exempt: <reason>`);
    }
    const inline = text.search(/\.auth\.getUser\(|===\s*(serviceRoleKey|supabaseKey|SERVICE_KEY|SUPABASE_SERVICE_ROLE_KEY)\b|(serviceRoleKey|supabaseKey|SERVICE_KEY)\s*===/);
    if (inline >= 0) {
      problems.push(`${rel(entry)}:${lineOf(text, inline)} checks auth inline; use _shared/auth.ts`);
    }
  }
  return { name: 'edge function auth', problems };
});

/**
 * RLS: a migration that creates a public table must enable RLS on it in the
 * same file. Checked for migrations after the 45/45 baseline, so the rule
 * holds for every table from here on.
 */
const RLS_BASELINE = '20261022000000';
guards.push(function migrationsEnableRls() {
  const problems = [];
  const dir = join(ROOT, 'supabase/migrations');
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    if (name.slice(0, 14) <= RLS_BASELINE) continue;
    const sql = readFileSync(join(dir, name), 'utf8').replace(/--[^\n]*/g, '');
    const created = [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)]
      .map((m) => m[1].toLowerCase());
    for (const table of created) {
      const rls = new RegExp(`alter\\s+table\\s+(?:only\\s+)?(?:public\\.)?"?${table}"?\\s+enable\\s+row\\s+level\\s+security`, 'i');
      if (!rls.test(sql)) problems.push(`supabase/migrations/${name} creates ${table} without ENABLE ROW LEVEL SECURITY`);
    }
  }
  return { name: 'migrations enable RLS', problems };
});

/**
 * Brand scope: brands are isolated tenants, and brand_id was added after the
 * tables were already user-scoped, so a read that filters only by user_id
 * silently mixes a creator's brands together. A read of a brand-scoped table
 * must filter by brand_id, or by a key that is already brand-scoped (its own
 * id, a parent *_id), or carry an `all-brands: <reason>` comment within the
 * three lines above it when crossing brands is the point.
 *
 * BRAND_SCOPED_TABLES is every public table with brand_id NOT NULL. A new
 * brand-scoped table goes on this list in the PR that creates it.
 */
const BRAND_SCOPED_TABLES = [
  'ai_content_suggestions', 'ai_daily_briefs', 'brand_prospect_activities', 'brand_prospects',
  'brand_social_accounts', 'challenge_day_completions', 'challenge_metrics', 'challenge_progress',
  'comments', 'content_post_metrics_daily', 'content_posts', 'content_workflow_stages',
  'deal_activities', 'deal_contracts', 'deal_fit_checks', 'deal_invoices', 'deal_performance_reports',
  'deal_production_checklist', 'deal_renewals', 'deal_reports', 'deal_stages', 'deal_templates',
  'deals', 'media_kit_leads', 'media_kit_rates', 'media_kits', 'media_library',
  'pfm_account_snapshots', 'platform_metrics', 'playbook_tasks', 'post_analytics',
  'revenue_records', 'saved_content_ideas', 'suggested_times_cache', 'user_content_profiles',
];
guards.push(function brandScopedReads() {
  const problems = [];
  const files = [
    ...walk(join(ROOT, 'src'), ['.ts', '.tsx']),
    ...walk(join(ROOT, 'supabase/functions'), ['.ts']),
  ].filter((f) => !/(\.test\.tsx?|_test\.ts)$/.test(f));
  const fromTable = new RegExp(`\\.from\\(\\s*["'](${BRAND_SCOPED_TABLES.join('|')})["']\\s*\\)`, 'g');
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(fromTable)) {
      const chain = text.slice(m.index + m[0].length, m.index + m[0].length + 900).split(/\.from\(|;\s*$/m)[0];
      if (!/\.select\(/.test(chain) || /\.(insert|upsert|update|delete)\(/.test(chain)) continue;
      const keys = [...chain.matchAll(/\.(?:eq|in|match)\(\s*["'`]([a-z_]+)["'`]/g)].map((k) => k[1]);
      if (keys.some((k) => k === 'brand_id' || k === 'id' || (k.endsWith('_id') && k !== 'user_id'))) continue;
      const line = lineOf(text, m.index);
      const above = text.split('\n').slice(Math.max(0, line - 4), line).join('\n');
      if (/all-brands:\s*\S/.test(above)) continue;
      problems.push(`${rel(file)}:${line} reads ${m[1]} without a brand_id filter (or an all-brands: comment)`);
    }
  }
  return { name: 'brand-scoped reads', problems };
});

let failed = false;
for (const guard of guards) {
  const { name, problems } = guard();
  if (problems.length) {
    failed = true;
    console.error(`✗ ${name}`);
    for (const p of problems) console.error(`  ${p}`);
  } else {
    console.log(`✓ ${name}`);
  }
}
process.exit(failed ? 1 : 0);
