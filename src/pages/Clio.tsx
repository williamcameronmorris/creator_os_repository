import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useAccount } from '../contexts/AccountContext';
import {
  Send,
  TrendingUp,
  Calendar,
  Lightbulb,
  ArrowRight,
  RefreshCw,
  Pencil,
  Check,
} from 'lucide-react';

// One turn in the Clio conversation thread. Prior turns are sent back to
// ask-copilot as `messages` so Clio keeps context across follow-ups.
type ChatTurn = { role: 'user' | 'assistant'; content: string };

// Shape of ai_daily_briefs.content, produced by the generate-daily-brief
// edge function (one Claude call per user per morning). Everything optional
// on the client so a partial brief still renders what it has.
type BriefIdea = {
  topic: string;
  hook?: string;
  reasoning?: string;
  platform?: string;
  content_type?: string;
};
type BriefContent = {
  headline?: string;
  performance?: { summary?: string; highlight_post?: string | null };
  niche_trend?: { summary?: string; example_title?: string | null };
  ideas?: BriefIdea[];
  best_time?: { hour_local?: string; note?: string };
};
type DailyBriefRow = {
  id: string;
  brief_date: string;
  content: BriefContent;
  model?: string | null;
};

// Inline markdown: convert **bold** to <strong>
function inlineMarkdown(text: string, lineKey: number) {
  const parts: (string | JSX.Element)[] = [];
  let remaining = text;
  let key = 0;
  while (remaining.includes('**')) {
    const start = remaining.indexOf('**');
    const end = remaining.indexOf('**', start + 2);
    if (end === -1) break;
    if (start > 0) parts.push(remaining.slice(0, start));
    parts.push(<strong key={`b${lineKey}-${key++}`}>{remaining.slice(start + 2, end)}</strong>);
    remaining = remaining.slice(end + 2);
  }
  if (remaining) parts.push(remaining);
  return parts.length > 0 ? parts : [text];
}

// Detect a numbered list of content ideas in a Clio response. Handles the
// markdown-heading format the copilot emits ("## 1. Title" followed by body
// paragraphs / Hook / Why) as well as plain "1. Title" lines.
// Returns { ideas: [{ number, title, body }], preamble } or null when fewer
// than 2 ideas are found.
function parseActionableIdeas(text: string) {
  const lines = text.split('\n');
  const ideas: { number: number; title: string; body: string }[] = [];
  const preambleLines: string[] = [];
  let current: { number: number; title: string; bodyLines: string[] } | null = null;

  // "## 1. Title", "1) Title", "**2.** Title" \u2014 optional heading hashes + bold.
  const IDEA_START = /^#{0,6}\s*\*{0,2}\s*(\d+)[.)]\s+(.+)$/;
  const HR = /^(-{3,}|\*{3,}|_{3,})$/;

  const flush = () => {
    if (current) {
      ideas.push({ number: current.number, title: current.title, body: current.bodyLines.join('\n').trim() });
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(IDEA_START);
    if (match) {
      flush();
      current = {
        number: parseInt(match[1], 10),
        title: match[2].replace(/\*\*/g, '').replace(/#+$/, '').trim(),
        bodyLines: [],
      };
    } else if (HR.test(trimmed)) {
      continue; // section divider \u2014 drop
    } else if (current) {
      current.bodyLines.push(line);
    } else {
      preambleLines.push(line);
    }
  }
  flush();

  // Only treat as actionable if we found 2+ numbered ideas.
  if (ideas.length < 2) return null;

  return { ideas, preamble: preambleLines.join('\n').trim() };
}

// Render lightweight markdown: bold, headings, horizontal rules, list items.
function renderMarkdown(text: string) {
  return text.split('\n').map((line, i) => {
    const trimmed = line.trim();

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      return <div key={i} className="border-t border-border my-4" />;
    }

    // Heading (#, ##, ### ...)
    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      return (
        <span
          key={i}
          className="block text-foreground mt-4 mb-1 first:mt-0"
          style={{ fontWeight: 500, fontSize: heading[1].length <= 1 ? '1.05rem' : '0.95rem', letterSpacing: '-0.01em' }}
        >
          {inlineMarkdown(heading[2], i)}
        </span>
      );
    }

    const isListItem = line.trimStart().startsWith('- ');
    return (
      <span key={i} style={isListItem ? { display: 'block', paddingLeft: '1rem' } : undefined}>
        {inlineMarkdown(line, i)}
        {'\n'}
      </span>
    );
  });
}

// Cycling placeholder prompts
const PLACEHOLDERS = [
  'What should I post today?',
  'Analyze my best performing content...',
  'Draft a caption for my next reel...',
  'What trends should I jump on?',
  'Help me plan this week\'s content...',
  'Why did my last post underperform?',
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function Clio() {
  const { user } = useAuth();
  const { activeAccount } = useAccount();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversation, setConversation] = useState<ChatTurn[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [voiceActive, setVoiceActive] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [hasDailyBrief, setHasDailyBrief] = useState(false);
  const [briefData, setBriefData] = useState<DailyBriefRow | null>(null);
  const [briefLoading, setBriefLoading] = useState(true);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [profileName, setProfileName] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Cycle placeholders
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Load profile name + daily brief in parallel
  useEffect(() => {
    const loadData = async () => {
      if (!user) { setBriefLoading(false); return; }
      try {
        // The cron writes brief_date as the UTC calendar date, so read it
        // back the same way (toISOString is UTC).
        const today = new Date().toISOString().split('T')[0];
        // Today's Daily Brief, written each morning by generate-daily-brief.
        // Fetch in isolation and swallow failures as "no brief today" — the
        // empty state offers Generate now instead.
        const fetchBrief = async (): Promise<DailyBriefRow | null> => {
          try {
            const { data, error } = await supabase
              .from('ai_daily_briefs')
              .select('*')
              .eq('user_id', user.id)
              .eq('brief_date', today)
              .maybeSingle();
            return error ? null : (data as DailyBriefRow | null);
          } catch {
            return null;
          }
        };
        const [profileRes, brief] = await Promise.all([
          supabase
            .from('profiles')
            .select('display_name, full_name')
            .eq('id', user.id)
            .maybeSingle(),
          fetchBrief(),
        ]);
        if (profileRes.data) {
          const name = profileRes.data.display_name
            || profileRes.data.full_name?.split(' ')[0]
            || '';
          if (name) setProfileName(name);
        }
        if (brief) {
          setHasDailyBrief(true);
          setBriefData(brief);
        }
      } catch {
        // non-critical
      } finally {
        setBriefLoading(false);
      }
    };
    loadData();
  }, [user]);

  const handleSubmit = async () => {
    if (!query.trim() || isLoading) return;
    const question = query.trim();
    setIsLoading(true);
    setErrorMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setErrorMsg('Your session expired. Please refresh and sign in again.');
        return;
      }
      const res = await supabase.functions.invoke('ask-copilot', {
        body: {
          userId: user!.id,
          question,
          // Prior turns so Clio keeps context across follow-ups. The edge
          // function validates + caps this at the last 12 turns anyway.
          messages: conversation.slice(-12),
          // Account Switcher scope: Clio answers as this account (its posts,
          // its voice, its niche). Omitted under "All accounts".
          ...(activeAccount ? { socialAccountId: activeAccount.id } : {}),
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.error) {
        // On a non-2xx, supabase-js sets error.message to a generic string and
        // puts the function's JSON body ({ error: "Daily AI quota exceeded." })
        // on error.context. Read it so the user sees the real message.
        let msg = 'Something went wrong. Try again.';
        try {
          const ctx = (res.error as { context?: Response }).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          }
        } catch { /* keep default */ }
        setErrorMsg(msg);
      } else if (res.data?.answer) {
        setConversation((prev) => [
          ...prev,
          { role: 'user', content: question },
          { role: 'assistant', content: res.data.answer },
        ]);
        setVoiceActive(!!res.data.voiceActive);
        setQuery('');
      } else {
        setErrorMsg('No response received. Try again.');
      }
    } catch {
      setErrorMsg('Something went wrong. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // On-demand brief: invokes generate-daily-brief with the session bearer
  // (same invoke pattern as ask-copilot above / IdeationStage). Counts
  // against the user's daily AI quota, unlike the morning cron.
  const handleGenerateBrief = async () => {
    if (generatingBrief) return;
    setGeneratingBrief(true);
    setErrorMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setErrorMsg('Your session expired. Please refresh and sign in again.');
        return;
      }
      const res = await supabase.functions.invoke('generate-daily-brief', {
        // Account Switcher scope: an on-demand brief generated while pinned to
        // an account is built from that account's posts/voice/niche. Brief
        // storage stays one row per user per day (per-account briefs are a
        // follow-up), so this regenerates today's brief in that flavor.
        body: activeAccount ? { socialAccountId: activeAccount.id } : {},
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.error) {
        // Same non-2xx handling as handleSubmit: the real message (e.g. the
        // quota error) lives in the JSON body on error.context.
        let msg = 'Couldn\'t generate your brief. Try again.';
        try {
          const ctx = (res.error as { context?: Response }).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          }
        } catch { /* keep default */ }
        setErrorMsg(msg);
      } else if (res.data?.brief) {
        setBriefData(res.data.brief as DailyBriefRow);
        setHasDailyBrief(true);
      } else {
        setErrorMsg('No brief received. Try again.');
      }
    } catch {
      setErrorMsg('Couldn\'t generate your brief. Try again.');
    } finally {
      setGeneratingBrief(false);
    }
  };

  // Hand a brief idea to Studio scripting — same deep-link contract as
  // Watch's clioParams (src/lib/watch.ts): Studio reads idea/platform/type/
  // hook/reasoning and autostarts the script.
  const startBriefIdea = (idea: BriefIdea) => {
    const params = new URLSearchParams({
      autostart: '1',
      idea: idea.topic,
      platform: idea.platform || 'instagram',
      type: idea.content_type || 'reel',
      hook: idea.hook || idea.topic,
      reasoning: idea.reasoning || 'From your Daily Brief',
    });
    navigate(`/studio/script?${params.toString()}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const firstName = profileName
    || user?.user_metadata?.full_name?.split(' ')[0]
    || 'Creator';

  // Suggestion cards for new users (no daily brief)
  const suggestions = [
    {
      icon: Lightbulb,
      label: 'GENERATE IDEAS',
      description: 'Get AI-powered content ideas based on your niche',
      prompt: 'Generate 5 content ideas for my next week of posts',
      accent: 'var(--accent)', // gold — primary
    },
    {
      icon: TrendingUp,
      label: 'ANALYZE TRENDS',
      description: 'See what\'s working in your space right now',
      prompt: 'What content trends should I be paying attention to?',
      accent: '#7A9E89', // muted sage
    },
    {
      icon: Calendar,
      label: 'PLAN MY WEEK',
      description: 'Build a posting schedule that makes sense',
      prompt: 'Help me plan my content for the next 7 days',
      accent: '#B07050', // muted terracotta
    },
  ];


  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">

      {/* Section marker */}
      <div className="t-micro mb-8 animate-reveal-up">
        <span className="text-foreground">01</span>
        <span className="mx-2">/</span>
        <span>CLIO</span>
      </div>

      {/* Greeting */}
      <div className="mb-10 animate-reveal-up">
        <span className="t-micro accent-dot mb-3 block">{getGreeting()}</span>
        <h1 className="t-display text-foreground">{firstName}.</h1>
      </div>

      {/* Copilot input */}
      <div className="ie-border-b ie-border-t py-6 mb-10 animate-reveal-up delay-1">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={PLACEHOLDERS[placeholderIdx]}
            rows={2}
            className="w-full bg-transparent text-foreground font-medium resize-none outline-none placeholder:text-muted-foreground"
            style={{ fontSize: '1.0625rem', letterSpacing: '-0.01em', lineHeight: 1.5 }}
          />
          <div className="flex items-center justify-between mt-4">
            <span className="t-micro">ASK ANYTHING ABOUT YOUR CONTENT</span>
            <button
              onClick={handleSubmit}
              disabled={isLoading || !query.trim()}
              className="btn-ie btn-ie-solid disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ fontSize: '10px', padding: '0.5rem 1.25rem' }}
            >
              <span className="btn-ie-text">{isLoading ? 'THINKING…' : 'SEND'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Conversation thread */}
      {conversation.map((turn, turnIdx) => {
        if (turn.role === 'user') {
          return (
            <div key={turnIdx} className="mb-6 animate-reveal-up">
              <span className="t-micro mb-2 block">You</span>
              <p
                className="text-foreground leading-relaxed whitespace-pre-wrap"
                style={{ fontWeight: 500, fontSize: '0.95rem', letterSpacing: '-0.01em' }}
              >
                {turn.content}
              </p>
            </div>
          );
        }

        const clioLabel = (
          <div className="flex items-baseline gap-3 mb-4">
            <span className="t-micro accent-dot">Clio</span>
            {voiceActive && (
              <span className="t-micro inline-flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                <Check className="w-3 h-3" /> In your voice
              </span>
            )}
          </div>
        );

        const parsed = parseActionableIdeas(turn.content);
        if (parsed) {
          // If the user asked for a specific count and we got fewer, flag it.
          const askedQuestion = conversation[turnIdx - 1]?.role === 'user' ? conversation[turnIdx - 1].content : '';
          const m = askedQuestion.match(/\b(\d+)\s+(?:content\s+)?(?:ideas?|suggestions?|posts?)\b/i);
          const requested = m ? parseInt(m[1], 10) : 0;
          return (
            <div key={turnIdx} className="border-b border-border pb-6 mb-10 animate-reveal-up">
              {clioLabel}
              {parsed.preamble && (
                <div className="t-body text-foreground leading-relaxed whitespace-pre-wrap mb-5">
                  {renderMarkdown(parsed.preamble)}
                </div>
              )}
              {requested > 0 && parsed.ideas.length < requested && (
                <div className="t-micro text-muted-foreground mb-3 inline-flex items-center gap-2 px-2.5 py-1 border border-border">
                  Showing {parsed.ideas.length} of {requested} · ask again for the full set
                </div>
              )}
              <div className="t-body text-muted-foreground mb-3">Tap an idea to start a script in Studio.</div>
              <div>
                {parsed.ideas.map((idea, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      const params = new URLSearchParams({
                        idea: idea.title,
                        reasoning: idea.body.slice(0, 600),
                        autostart: '1',
                      });
                      navigate(`/studio/workflow?${params.toString()}`);
                    }}
                    className="w-full text-left group block border-b border-border py-5"
                  >
                    <div className="flex items-baseline gap-4">
                      <span className="t-micro text-muted-foreground" style={{ minWidth: '1.5rem' }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span
                          className="block text-foreground group-hover:text-accent transition-colors"
                          style={{ fontWeight: 500, fontSize: '0.95rem', letterSpacing: '-0.01em' }}
                        >
                          {idea.title}
                        </span>
                        {idea.body && (
                          <div className="t-body text-muted-foreground leading-relaxed whitespace-pre-wrap mt-1.5">
                            {renderMarkdown(idea.body)}
                          </div>
                        )}
                      </div>
                      <span className="t-micro text-muted-foreground group-hover:text-accent transition-colors whitespace-nowrap">
                        START →
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        }
        return (
          <div key={turnIdx} className="border-b border-border pb-6 mb-10 animate-reveal-up">
            {clioLabel}
            <div className="t-body text-foreground leading-relaxed whitespace-pre-wrap">
              {renderMarkdown(turn.content)}
            </div>
          </div>
        );
      })}

      {/* Transient error — kept out of the thread so it's never replayed as history */}
      {errorMsg && (
        <div className="pb-6 mb-10 animate-reveal-up">
          <span className="t-micro accent-dot mb-4 block">Clio</span>
          <div className="t-body text-foreground leading-relaxed whitespace-pre-wrap">{errorMsg}</div>
        </div>
      )}

      {/* Adaptive content */}
      {conversation.length === 0 && !errorMsg && !briefLoading && (
        <>
          {hasDailyBrief && briefData?.content ? (
            <div className="animate-reveal-up delay-2">
              <span className="t-micro accent-dot mb-5 block">Your Daily Brief</span>

              {briefData.content.headline && (
                <p
                  className="text-foreground mb-5"
                  style={{ fontWeight: 500, fontSize: '1.0625rem', letterSpacing: '-0.01em', lineHeight: 1.4 }}
                >
                  {briefData.content.headline}
                </p>
              )}

              {briefData.content.performance?.summary && (
                <div className="card-industrial p-5 mb-4">
                  <span className="t-micro mb-2 block">YOUR WEEK</span>
                  <p className="t-body text-foreground">
                    {briefData.content.performance.summary}
                  </p>
                  {briefData.content.performance.highlight_post && (
                    <p className="t-body mt-2">
                      Top performer: <span className="text-foreground font-medium">{briefData.content.performance.highlight_post}</span>
                    </p>
                  )}
                </div>
              )}

              {briefData.content.niche_trend?.summary && (
                <div className="card-industrial p-5 mb-4">
                  <span className="t-micro mb-2 block">TRENDING IN YOUR NICHE</span>
                  <p className="t-body text-foreground">
                    {briefData.content.niche_trend.summary}
                  </p>
                  {briefData.content.niche_trend.example_title && (
                    <p className="t-body mt-2">
                      Example: <span className="text-foreground font-medium">"{briefData.content.niche_trend.example_title}"</span>
                    </p>
                  )}
                </div>
              )}

              {(briefData.content.ideas?.length ?? 0) > 0 && (
                <div className="card-industrial p-5 mb-4">
                  <span className="t-micro mb-1 block">TODAY'S IDEAS</span>
                  <div className="t-body text-muted-foreground mb-2">Tap an idea to start a script in Studio.</div>
                  <div>
                    {briefData.content.ideas!.map((idea, i) => (
                      <button
                        key={i}
                        onClick={() => startBriefIdea(idea)}
                        className="w-full text-left group block border-b border-border last:border-b-0 py-4"
                      >
                        <div className="flex items-baseline gap-4">
                          <span className="t-micro text-muted-foreground" style={{ minWidth: '1.5rem' }}>
                            {String(i + 1).padStart(2, '0')}
                          </span>
                          <div className="flex-1 min-w-0">
                            <span
                              className="block text-foreground group-hover:text-accent transition-colors"
                              style={{ fontWeight: 500, fontSize: '0.95rem', letterSpacing: '-0.01em' }}
                            >
                              {idea.topic}
                            </span>
                            {idea.hook && (
                              <span className="t-body text-muted-foreground block mt-1">"{idea.hook}"</span>
                            )}
                            {idea.reasoning && (
                              <span className="t-body text-muted-foreground block mt-1">{idea.reasoning}</span>
                            )}
                          </div>
                          <span className="t-micro text-muted-foreground group-hover:text-accent transition-colors whitespace-nowrap">
                            START →
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {briefData.content.best_time?.hour_local && (
                <div className="card-industrial p-5">
                  <span className="t-micro mb-2 block">BEST TIME TO POST</span>
                  <p className="text-sm font-medium text-foreground">
                    {briefData.content.best_time.hour_local}
                    {briefData.content.best_time.note && (
                      <span className="t-body text-muted-foreground font-normal"> — {briefData.content.best_time.note}</span>
                    )}
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* No brief yet: empty state + suggestion cards */
            <div className="animate-reveal-up delay-2">
              <div className="ie-border-b pb-6 mb-8">
                <span className="t-micro accent-dot mb-3 block">Your Daily Brief</span>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <p className="t-body text-muted-foreground">Your brief arrives tomorrow morning.</p>
                  <button
                    onClick={handleGenerateBrief}
                    disabled={generatingBrief}
                    className="btn-ie disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ fontSize: '10px', padding: '0.5rem 1.25rem' }}
                  >
                    <span className="btn-ie-text inline-flex items-center gap-2">
                      {generatingBrief && <RefreshCw className="w-3 h-3 animate-spin" />}
                      {generatingBrief ? 'GENERATING…' : 'GENERATE NOW'}
                    </span>
                  </button>
                </div>
              </div>
              <span className="t-micro accent-dot mb-5 block">Start here</span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {suggestions.map((s) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.label}
                      onClick={s.prompt ? () => { setQuery(s.prompt); inputRef.current?.focus(); } : s.action}
                      className="card-industrial p-5 text-left group flex items-start gap-4 cursor-pointer"
                      style={{ borderLeft: `2px solid ${s.accent}` }}
                    >
                      <div
                        className="w-8 h-8 flex items-center justify-center border flex-shrink-0 transition-colors"
                        style={{ borderColor: s.accent }}
                      >
                        <Icon className="w-4 h-4 transition-colors" style={{ color: s.accent }} />
                      </div>
                      <div>
                        <div className="t-micro text-foreground mb-1">{s.label}</div>
                        <div className="t-body">{s.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
}
