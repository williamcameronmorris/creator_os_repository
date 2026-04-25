// supabase/functions/delete-account/index.ts
//
// Deploy:
//   supabase functions deploy delete-account --no-verify-jwt
//
// We deploy with verify_jwt=false (per project convention) and verify the
// caller's bearer token inside the function using the SERVICE_ROLE key.
// This lets us perform privileged deletes (auth.users + cascade tables) after
// confirming the requester is the account owner.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response('Missing bearer token', {
        status: 401,
        headers: corsHeaders,
      });
    }
    const accessToken = authHeader.slice('Bearer '.length);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userRes, error: userErr } = await admin.auth.getUser(accessToken);
    if (userErr || !userRes?.user) {
      return new Response('Invalid session', {
        status: 401,
        headers: corsHeaders,
      });
    }
    const userId = userRes.user.id;

    const tablesToClear = [
      'content_posts_unified',
      'saved_ideas',
      'social_connections',
      'scheduled_tasks',
      'analytics_snapshots',
      'challenge_progress',
      'challenge_baselines',
      'compose_drafts',
      'profiles',
    ];

    const errors: { table: string; message: string }[] = [];
    for (const table of tablesToClear) {
      const { error } = await admin.from(table).delete().eq('user_id', userId);
      if (error && table === 'profiles') {
        const { error: e2 } = await admin
          .from('profiles')
          .delete()
          .eq('id', userId);
        if (e2) errors.push({ table, message: e2.message });
      } else if (error) {
        if (!/does not exist/i.test(error.message)) {
          errors.push({ table, message: error.message });
        }
      }
    }

    const { error: authDeleteErr } = await admin.auth.admin.deleteUser(userId);
    if (authDeleteErr) {
      return new Response(
        JSON.stringify({
          ok: false,
          stage: 'auth.deleteUser',
          message: authDeleteErr.message,
          partialErrors: errors,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, partialErrors: errors }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, message: (e as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
