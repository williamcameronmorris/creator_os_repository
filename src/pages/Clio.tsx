import { useState, useRef, useEffect } from 'react';
// import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Send,
  TrendingUp,
  Calendar,
  Lightbulb,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

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
      {response && (
        <div className="ie-border-b pb-6 mb-8 animate-reveal-up">
          <span className="t-micro accent-dot mb-3 block">Clio</span>
          <div className="t-body text-foreground leading-relaxed whitespace-pre-wrap">
            {response}
          </div>
        </div>
      )}

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
