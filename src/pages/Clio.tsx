import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Send,
  TrendingUp,
  Calendar,
  Lightbulb,
  ArrowRight,
  RefreshCw,
  Pencil,
} from 'lucide-react';

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

// Detect numbered content ideas in Clio responses (e.g. "1. **Guitar Gear Collabs** — ...")
// Returns { ideas: [{number, title, description}], preamble, postscript }
function parseActionableIdeas(text: string) {
  const lines = text.split('\n');
  const ideas: { number: number; title: string; description: string; raw: string }[] = [];
  const preambleLines: string[] = [];
  const postscriptLines: string[] = [];
  let foundFirstIdea = false;
  let foundPostscript = false;
  let currentIdea: { number: number; title: string; description: string; raw: string } | null = null;

  for (const line of lines) {
    // Match patterns like "1. **Title** — description" or "1. Title — description"
    const ideaMatch = line.match(/^(\d+)\.\s+\*{0,2}(.+?)\*{0,2}\s*[—\-–:]\s*(.+)/);
    if (ideaMatch) {
      if (currentIdea) ideas.push(currentIdea);
      foundFirstIdea = true;
      foundPostscript = false;
      currentIdea = {
        number: parseInt(ideaMatch[1]),
        title: ideaMatch[2].replace(/\*\*/g, '').trim(),
        description: ideaMatch[3].trim(),
        raw: line,
      };
    } else if (currentIdea && line.trim() && !line.match(/^\d+\./)) {
      // Continuation of previous idea
      currentIdea.description += ' ' + line.trim();
    } else if (!foundFirstIdea) {
      preambleLines.push(line);
    } else if (line.trim() === '' && currentIdea) {
      // Blank line after an idea, could be gap or end
      continue;
    } else if (foundFirstIdea && !line.match(/^\d+\./)) {
      if (currentIdea) { ideas.push(currentIdea); currentIdea = null; }
      foundPostscript = true;
      postscriptLines.push(line);
    }
  }
  if (currentIdea) ideas.push(currentIdea);

  // Only treat as actionable if we found 2+ numbered ideas
  if (ideas.length < 2) return null;

  return {
    ideas,
    preamble: preambleLines.join('\n').trim(),
    postscript: postscriptLines.join('\n').trim(),
  };
}

// Render plain markdown (non-actionable responses)
function renderMarkdown(text: string) {
  return text.split('\n').map((line, i) => {
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
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState('');
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [hasDailyBrief, setHasDailyBrief] = useState(false);
  const [briefData, setBriefData] = useState<any>(null);
  const [briefLoading, setBriefLoading] = useState(true);
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
        const today = new Date().toISOString().split('T')[0];
        const [profileRes, briefRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('display_name, full_name')
            .eq('id', user.id)
            .maybeSingle(),
          supabase
            .from('ai_daily_briefs')
            .select('*')
            .eq('user_id', user.id)
            .eq('brief_date', today)
            .maybeSingle(),
        ]);
        if (profileRes.data) {
          const name = profileRes.data.display_name
            || profileRes.data.full_name?.split(' ')[0]
            || '';
          if (name) setProfileName(name);
        }
        if (briefRes.data) {
          setHasDailyBrief(true);
          setBriefData(briefRes.data);
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
    setIsLoading(true);
    setResponse('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await supabase.functions.invoke('ask-copilot', {
        body: { userId: user!.id, question: query },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.error) {
        setResponse(res.error.message || 'Something went wrong. Try again.');
      } else if (res.data?.answer) {
        setResponse(res.data.answer);
      } else {
        setResponse('No response received. Try again.');
      }
    } catch {
      setResponse('Something went wrong. Try again.');
    } finally {
      setIsLoading(false);
    }
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
    },
    {
      icon: TrendingUp,
      label: 'ANALYZE TRENDS',
      description: 'See what\'s working in your space right now',
      prompt: 'What content trends should I be paying attention to?',
    },
    {
      icon: Calendar,
      label: 'PLAN MY WEEK',
      description: 'Build a posting schedule that makes sense',
      prompt: 'Help me plan my content for the next 7 days',
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Greeting */}
      <div className="mb-8 animate-reveal-up">
        <span className="t-micro accent-dot mb-3 block">
          {getGreeting()}
        </span>
        <h1 className="t-display text-foreground">
          {firstName}.
        </h1>
      </div>

      {/* Copilot input: THE interface */}
      <div className="ie-border-b ie-border-t py-6 mb-8 animate-reveal-up delay-1">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={PLACEHOLDERS[placeholderIdx]}
            rows={2}
            className="w-full bg-transparent text-foreground text-lg font-medium leading-relaxed resize-none focus:outline-none placeholder:text-muted-foreground/50"
            style={{ letterSpacing: '-0.01em' }}
          />
          <div className="flex items-center justify-between mt-3">
            <span className="t-micro">Ask Clio anything</span>
            <button
              onClick={handleSubmit}
              disabled={!query.trim() || isLoading}
              className="btn-ie btn-ie-solid btn-ie-pill px-4 py-2 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <span className="btn-ie-text flex items-center gap-2">
                {isLoading ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Send className="w-3 h-3" />
                )}
                {isLoading ? 'THINKING' : 'ASK'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Response area */}
      {response && (() => {
        const parsed = parseActionableIdeas(response);
        if (parsed) {
          // Actionable ideas: render as tappable cards
          return (
            <div className="pb-6 mb-8 animate-reveal-up">
              <span className="t-micro accent-dot mb-3 block">Clio</span>
              {parsed.preamble && (
                <div className="t-body text-foreground leading-relaxed whitespace-pre-wrap mb-4">
                  {renderMarkdown(parsed.preamble)}
                </div>
              )}
              <div className="space-y-0">
                {parsed.ideas.map((idea) => (
                  <button
                    key={idea.number}
                    onClick={() => {
                      const params = new URLSearchParams({
                        idea: idea.title,
                        reasoning: idea.description.substring(0, 200),
                      });
                      navigate(`/studio/workflow?${params.toString()}`);
                    }}
                    className="w-full text-left data-row group ie-border-b"
                  >
                    <span className="t-micro font-bold text-foreground" style={{ minWidth: '30px' }}>
                      {String(idea.number).padStart(2, '0')}
                    </span>
                    <div className="flex-1 ml-4">
                      <span className="text-sm font-semibold text-foreground block">
                        {idea.title}
                      </span>
                      <span className="t-body text-muted-foreground text-xs mt-0.5 block line-clamp-2">
                        {idea.description}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 ml-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="t-micro text-muted-foreground whitespace-nowrap">SCRIPT IT</span>
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
              {parsed.postscript && (
                <div className="t-body text-foreground leading-relaxed whitespace-pre-wrap mt-4 ie-border-b pb-6">
                  {renderMarkdown(parsed.postscript)}
                </div>
              )}
            </div>
          );
        }
        // Non-actionable response: plain markdown
        return (
          <div className="ie-border-b pb-6 mb-8 animate-reveal-up">
            <span className="t-micro accent-dot mb-3 block">Clio</span>
            <div className="t-body text-foreground leading-relaxed whitespace-pre-wrap">
              {renderMarkdown(response)}
            </div>
          </div>
        );
      })()}

      {/* Adaptive content */}
      {!response && !briefLoading && (
        <>
          {hasDailyBrief && briefData ? (
            /* Returning user: Daily Brief */
            <div className="animate-reveal-up delay-2">
              <span className="t-micro accent-dot mb-4 block">Your Daily Brief</span>

              {briefData.top_performer && (
                <div className="card-industrial p-5 mb-4">
                  <span className="t-micro mb-2 block" style={{ color: 'var(--muted-foreground)' }}>TOP PERFORMER</span>
                  <p className="text-sm font-medium text-foreground mb-1">
                    {briefData.top_performer.caption?.substring(0, 80) || 'Your best recent post'}
                    {briefData.top_performer.caption?.length > 80 ? '...' : ''}
                  </p>
                  <p className="t-body">
                    {briefData.top_performer.insight || 'Outperformed your average engagement.'}
                  </p>
                </div>
              )}

              {briefData.recommendations && briefData.recommendations.length > 0 && (
                <div className="space-y-0">
                  <span className="t-micro mb-3 block" style={{ color: 'var(--muted-foreground)' }}>RECOMMENDATIONS</span>
                  {briefData.recommendations.slice(0, 3).map((rec: any, i: number) => (
                    <div
                      key={i}
                      className="data-row cursor-pointer group"
                      onClick={() => {
                        setQuery(rec.action || rec.suggestion || '');
                        inputRef.current?.focus();
                      }}
                    >
                      <span className="t-micro font-bold text-foreground" style={{ minWidth: '30px' }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="text-sm text-foreground flex-1 ml-4">
                        {rec.suggestion || rec.title}
                      </span>
                      <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* New user: Suggestion cards */
            <div className="animate-reveal-up delay-2">
              <span className="t-micro accent-dot mb-4 block">Get Started</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-0">
                {suggestions.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        setQuery(s.prompt);
                        inputRef.current?.focus();
                      }}
                      className={`card-industrial p-5 text-left group ${
                        i < suggestions.length - 1 ? 'sm:ie-border-r' : ''
                      }`}
                    >
                      <Icon className="w-5 h-5 text-foreground mb-3" />
                      <span className="t-micro block mb-2 text-foreground">{s.label}</span>
                      <p className="t-body">{s.description}</p>
                      <ArrowRight className="w-4 h-4 text-muted-foreground mt-3 opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:translate-x-1" />
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
