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
