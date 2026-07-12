import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Check, Copy, RefreshCw, X, Image as ImageIcon } from 'lucide-react';

/**
 * PlaybookPanel — "Today's Plays"
 *
 * Lists the user's pending playbook_tasks that are due now, overdue, or due
 * within the next hour, grouped by the post they belong to. Tasks are created
 * automatically by the create_playbook_tasks DB trigger when a post
 * publishes; the pre-drafted content (`body`) is filled on demand by the
 * generate-playbook-content edge function ("Draft it").
 *
 * Refetches on mount and every 60s while the tab is visible — no realtime
 * subscription needed for a checklist that moves on hour timescales.
 */

type PlaybookPost = {
  caption: string | null;
  title: string | null;
  thumbnail_url: string | null;
  media_urls: string[] | null;
  platform: string | null;
  account_username: string | null;
};

type PlaybookTask = {
  id: string;
  content_post_id: string | null;
  platform: string | null;
  account_username: string | null;
  task_type: 'story_cta' | 'story_results' | 'engage_window' | 'first_check' | 'pin_comment';
  title: string;
  body: string | null;
  due_at: string;
  status: string;
  content_posts: PlaybookPost | PlaybookPost[] | null;
};

const TYPE_CHIP: Record<PlaybookTask['task_type'], string> = {
  story_cta: 'STORY CTA',
  story_results: 'RESULTS',
  engage_window: 'ENGAGE',
  first_check: '24H CHECK',
  pin_comment: 'PIN COMMENT',
};

/** Task types the edge function can pre-draft content for. */
const DRAFTABLE = new Set(['story_cta', 'story_results', 'pin_comment']);

const TERRACOTTA = '#B07050';

/** "due in 2h 14m" / "DUE NOW" / "1h 20m overdue" with the matching color. */
function dueLabel(dueAt: string, now: number): { text: string; color?: string; emphasized: boolean } {
  const diffMs = new Date(dueAt).getTime() - now;
  const abs = Math.abs(diffMs);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const span = h > 0 ? `${h}h ${m}m` : `${m}m`;

  if (diffMs > 60_000) return { text: `DUE IN ${span}`, emphasized: false };
  // Within a 15-minute grace band of the due instant: it's live, do it now.
  if (diffMs > -15 * 60_000) return { text: 'DUE NOW', color: 'var(--accent)', emphasized: true };
  return { text: `${span} OVERDUE`, color: TERRACOTTA, emphasized: true };
}

function postOf(task: PlaybookTask): PlaybookPost | null {
  const p = task.content_posts;
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

function thumbOf(post: PlaybookPost | null): string | null {
  if (!post) return null;
  return post.thumbnail_url || (post.media_urls && post.media_urls[0]) || null;
}

export function PlaybookPanel() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<PlaybookTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  // Refetch guard: never overlap two fetches (interval + manual actions).
  const fetchingRef = useRef(false);

  const fetchTasks = useCallback(async () => {
    if (!user || fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      // Due now, overdue, or coming due within the hour.
      const horizon = new Date(Date.now() + 60 * 60_000).toISOString();
      const { data, error } = await supabase
        .from('playbook_tasks')
        .select('id, content_post_id, platform, account_username, task_type, title, body, due_at, status, content_posts(caption, title, thumbnail_url, media_urls, platform, account_username)')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .lte('due_at', horizon)
        .order('due_at', { ascending: true })
        .limit(30);
      if (!error && data) setTasks(data as unknown as PlaybookTask[]);
      setNow(Date.now());
    } catch {
      // non-critical — keep whatever we had
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [user]);

  // Fetch on mount + every 60s while the tab is visible.
  useEffect(() => {
    fetchTasks();
    const interval = setInterval(() => {
      if (!document.hidden) fetchTasks();
    }, 60_000);
    const onVisible = () => {
      if (!document.hidden) fetchTasks();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchTasks]);

  // Optimistic status change; RLS + column grants only allow status updates.
  const setStatus = async (taskId: string, status: 'done' | 'dismissed') => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    await supabase.from('playbook_tasks').update({ status }).eq('id', taskId);
  };

  const draftIt = async (task: PlaybookTask) => {
    if (draftingId) return;
    setDraftingId(task.id);
    setErrorMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setErrorMsg('Your session expired. Please refresh and sign in again.');
        return;
      }
      const res = await supabase.functions.invoke('generate-playbook-content', {
        body: { taskId: task.id },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.error) {
        // Non-2xx: the real message ({ error }) lives on error.context.
        let msg = 'Couldn\'t draft that. Try again.';
        try {
          const ctx = (res.error as { context?: Response }).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          }
        } catch { /* keep default */ }
        setErrorMsg(msg);
      } else if (res.data?.body) {
        const body = res.data.body as string;
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, body } : t)));
      } else {
        setErrorMsg('No draft received. Try again.');
      }
    } catch {
      setErrorMsg('Couldn\'t draft that. Try again.');
    } finally {
      setDraftingId(null);
    }
  };

  const copyBody = async (task: PlaybookTask) => {
    if (!task.body) return;
    try {
      await navigator.clipboard.writeText(task.body);
      setCopiedId(task.id);
      setTimeout(() => setCopiedId((id) => (id === task.id ? null : id)), 2000);
    } catch {
      setErrorMsg('Copy failed — select the text manually.');
    }
  };

  // Group by post, preserving due-date order of each group's earliest task.
  const groups: { key: string; tasks: PlaybookTask[] }[] = [];
  {
    const byPost = new Map<string, PlaybookTask[]>();
    for (const t of tasks) {
      const key = t.content_post_id || t.id;
      const arr = byPost.get(key);
      if (arr) arr.push(t);
      else byPost.set(key, [t]);
    }
    for (const [key, groupTasks] of byPost) groups.push({ key, tasks: groupTasks });
  }

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-5">
        <span className="t-micro accent-dot">Today's Plays</span>
        {tasks.length > 0 && (
          <span className="t-micro text-foreground">{String(tasks.length).padStart(2, '0')}</span>
        )}
      </div>

      {errorMsg && (
        <div className="t-micro mb-4" style={{ color: TERRACOTTA }}>{errorMsg}</div>
      )}

      {loading ? (
        <div className="t-micro py-4">LOADING&hellip;</div>
      ) : groups.length === 0 ? (
        <div className="t-body text-muted-foreground pb-2">
          Nothing due right now. Plays appear here the moment a post publishes.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const post = postOf(group.tasks[0]);
            const thumb = thumbOf(post);
            const captionLine = (post?.caption || post?.title || 'Untitled post').split('\n')[0].slice(0, 90);
            const handle = group.tasks[0].account_username || post?.account_username;
            const platform = (group.tasks[0].platform || post?.platform || '').toUpperCase();

            return (
              <div key={group.key} className="card-industrial p-5">
                {/* Post header: thumbnail + caption first line + @account */}
                <div className="flex items-center gap-3 pb-4 border-b border-border">
                  <div
                    className="flex-shrink-0 border border-border bg-muted/20 overflow-hidden flex items-center justify-center"
                    style={{ width: 40, height: 40 }}
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-foreground font-medium truncate" style={{ fontSize: '13px' }}>
                      {captionLine}
                    </div>
                    <div className="t-micro mt-0.5">
                      {platform}
                      {handle ? ` · @${handle}` : ''}
                    </div>
                  </div>
                </div>

                {/* Tasks */}
                <div>
                  {group.tasks.map((task) => {
                    const due = dueLabel(task.due_at, now);
                    const hasBody = !!(task.body && task.body.trim());
                    const canDraft = !hasBody && DRAFTABLE.has(task.task_type);
                    return (
                      <div key={task.id} className="py-4 border-b border-border last:border-b-0 last:pb-0">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                              <span className="t-micro px-1.5 py-0.5 border border-border text-foreground">
                                {TYPE_CHIP[task.task_type]}
                              </span>
                              <span
                                className="t-micro"
                                style={due.color ? { color: due.color, fontWeight: due.emphasized ? 600 : undefined } : undefined}
                              >
                                {due.text}
                              </span>
                            </div>
                            <div className="text-foreground" style={{ fontWeight: 500, fontSize: '0.9rem', letterSpacing: '-0.01em' }}>
                              {task.title}
                            </div>
                          </div>

                          {/* Actions: done + dismiss */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => setStatus(task.id, 'done')}
                              className="t-micro text-foreground hover:text-accent transition-colors inline-flex items-center gap-1 border border-border px-2 py-1"
                              title="Mark done"
                            >
                              <Check className="w-3 h-3" /> DONE
                            </button>
                            <button
                              onClick={() => setStatus(task.id, 'dismissed')}
                              className="text-muted-foreground hover:text-foreground transition-colors p-1"
                              title="Dismiss"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Pre-drafted content + copy, or Draft it */}
                        {hasBody && (
                          <div className="mt-3 border border-border bg-muted/10 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <p className="t-body text-foreground whitespace-pre-wrap flex-1 min-w-0" style={{ fontSize: '13px' }}>
                                {task.body}
                              </p>
                              <button
                                onClick={() => copyBody(task)}
                                className="t-micro text-foreground hover:text-accent transition-colors inline-flex items-center gap-1 flex-shrink-0"
                                title="Copy to clipboard"
                              >
                                {copiedId === task.id
                                  ? (<><Check className="w-3 h-3" style={{ color: 'var(--accent)' }} /> COPIED</>)
                                  : (<><Copy className="w-3 h-3" /> COPY</>)}
                              </button>
                            </div>
                          </div>
                        )}
                        {canDraft && (
                          <div className="mt-3">
                            <button
                              onClick={() => draftIt(task)}
                              disabled={draftingId !== null}
                              className="btn-ie disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{ fontSize: '10px', padding: '0.4rem 1rem' }}
                            >
                              <span className="btn-ie-text inline-flex items-center gap-2">
                                {draftingId === task.id && <RefreshCw className="w-3 h-3 animate-spin" />}
                                {draftingId === task.id ? 'DRAFTING…' : 'DRAFT IT'}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
