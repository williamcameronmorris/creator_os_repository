import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing Authorization header');

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) throw new Error('Unauthorized');

    const { commentId, platform, replyText } = await req.json();
    if (!commentId || !platform || !replyText?.trim()) {
      throw new Error('Missing required fields: commentId, platform, replyText');
    }

    // Fetch user profile for platform tokens
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(`
        facebook_page_access_token,
        instagram_business_account_id,
        youtube_access_token,
        youtube_refresh_token,
        threads_access_token,
        threads_user_id
      `)
      .eq('id', user.id)
      .single();

    if (profileError || !profile) throw new Error('Profile not found');

    // ── Route to platform handler ──────────────────────────────────────────────

    if (platform === 'instagram') {
      await replyInstagram(commentId, replyText.trim(), profile);
    } else if (platform === 'youtube') {
      const freshToken = await replyYouTube(commentId, replyText.trim(), profile, supabase, user.id);
      if (freshToken) {
        // Token was refreshed — already saved inside replyYouTube
      }
    } else if (platform === 'threads') {
      await replyThreads(commentId, replyText.trim(), profile);
    } else {
      throw new Error(`Platform "${platform}" does not support live replies yet.`);
    }

    // ── Update comment record in DB ────────────────────────────────────────────
    await supabase
      .from('comments')
      .update({
        is_replied: true,
        reply_text: replyText.trim(),
        replied_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('comment_id', commentId);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('reply-to-comment error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ── Instagram ──────────────────────────────────────────────────────────────────
// POST /{comment-id}/replies — requires instagram_manage_comments permission
async function replyInstagram(commentId: string, text: string, profile: any) {
  const token = profile.facebook_page_access_token;
  if (!token) throw new Error('Instagram not connected. Please reconnect your account in Settings.');

  const url = new URL(`https://graph.facebook.com/v25.0/${commentId}/replies`);
  url.searchParams.set('message', text);
  url.searchParams.set('access_token', token);

  const res = await fetch(url.toString(), { method: 'POST' });
  const data = await res.json();

  if (!res.ok || data.error) {
    const msg = data.error?.message || 'Instagram reply failed';
    // Surface a useful message if the app is in dev mode vs missing permission
    if (msg.includes('does not have permission') || msg.includes('manage_comments')) {
      throw new Error(
        'Instagram comment replies require reconnecting your account to grant the manage_comments permission. Go to Settings and reconnect Instagram.'
      );
    }
    throw new Error(`Instagram: ${msg}`);
  }
}

// ── YouTube ────────────────────────────────────────────────────────────────────
// POST /youtube/v3/comments — parentId is the commentThread id
// The youtube scope already includes comment write access
async function replyYouTube(
  commentId: string,
  text: string,
  profile: any,
  supabase: any,
  userId: string
): Promise<string | null> {
  let token = profile.youtube_access_token;
  if (!token) throw new Error('YouTube not connected.');

  const body = {
    snippet: {
      parentId: commentId,
      textOriginal: text,
    },
  };

  let res = await fetch(
    'https://www.googleapis.com/youtube/v3/comments?part=snippet',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  // Try refreshing token once if unauthorized
  if (res.status === 401 && profile.youtube_refresh_token) {
    token = await refreshYouTubeToken(profile.youtube_refresh_token, supabase, userId);
    res = await fetch(
      'https://www.googleapis.com/youtube/v3/comments?part=snippet',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );
  }

  const data = await res.json();
  if (!res.ok) {
    const msg = data.error?.message || 'YouTube reply failed';
    throw new Error(`YouTube: ${msg}`);
  }
  return token;
}

async function refreshYouTubeToken(refreshToken: string, supabase: any, userId: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('VITE_YOUTUBE_CLIENT_ID') || Deno.env.get('YOUTUBE_CLIENT_ID') || '',
      client_secret: Deno.env.get('YOUTUBE_CLIENT_SECRET') || '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to refresh YouTube token');
  await supabase
    .from('profiles')
    .update({ youtube_access_token: data.access_token })
    .eq('id', userId);
  return data.access_token;
}

// ── Threads ────────────────────────────────────────────────────────────────────
// Two-step: create container → publish
// Requires threads_manage_replies scope (already in our OAuth flow)
async function replyThreads(commentId: string, text: string, profile: any) {
  const token = profile.threads_access_token;
  const userId = profile.threads_user_id;
  if (!token || !userId) throw new Error('Threads not connected.');

  // Step 1: Create reply container
  const createUrl = new URL(`https://graph.threads.net/v1.0/${userId}/threads`);
  createUrl.searchParams.set('media_type', 'TEXT');
  createUrl.searchParams.set('text', text);
  createUrl.searchParams.set('reply_to_id', commentId);
  createUrl.searchParams.set('access_token', token);

  const createRes = await fetch(createUrl.toString(), { method: 'POST' });
  const createData = await createRes.json();

  if (!createRes.ok || createData.error) {
    const msg = createData.error?.message || 'Threads reply container creation failed';
    throw new Error(`Threads: ${msg}`);
  }

  const creationId = createData.id;
  if (!creationId) throw new Error('Threads: no creation_id returned');

  // Step 2: Publish the reply
  const publishUrl = new URL(`https://graph.threads.net/v1.0/${userId}/threads_publish`);
  publishUrl.searchParams.set('creation_id', creationId);
  publishUrl.searchParams.set('access_token', token);

  const publishRes = await fetch(publishUrl.toString(), { method: 'POST' });
  const publishData = await publishRes.json();

  if (!publishRes.ok || publishData.error) {
    const msg = publishData.error?.message || 'Threads reply publish failed';
    throw new Error(`Threads: ${msg}`);
  }
}
