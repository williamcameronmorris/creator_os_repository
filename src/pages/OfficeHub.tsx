import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowRight,
  Calendar,
  TrendingUp,
  DollarSign,
  BarChart3,
} from 'lucide-react';

export function OfficeHub() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [topPost, setTopPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTopPost = async () => {
      if (!user) { setLoading(false); return; }
      try {
        // Try to get top performing post from recent daily brief
        const { data: brief } = await supabase
          .from('ai_daily_briefs')
          .select('top_performer')
          .eq('user_id', user.id)
          .order('brief_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (brief?.top_performer) {
          setTopPost(brief.top_performer);
        }
      } catch {
        // non-critical
      } finally {
        setLoading(false);
      }
    };
    loadTopPost();
  }, [user]);

  const tiles = [
    {
      id: 'schedule',
      icon: Calendar,
      label: 'CONTENT SCHEDULE',
      description: 'Manage and schedule your upcoming posts',
      path: '/schedule',
    },
    {
      id: 'analytics',
      icon: TrendingUp,
      label: 'ANALYTICS',
      description: 'Track growth, engagement, and performance',
      path: '/analytics',
    },
    /* ARCHIVED: Revenue & Deal pipeline tiles -- restore when expanding into brand deals/monetization
    {
      id: 'revenue',
      icon: DollarSign,
      label: 'REVENUE',
      description: 'Track income and financial performance',
      path: '/revenue',
    },
    {
      id: 'pipeline',
      icon: BarChart3,
      label: 'DEAL PIPELINE',
      description: 'Manage brand deals and partnerships',
      path: '/pipeline',
    },
    */
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8 animate-reveal-up">
        <span className="t-micro accent-dot mb-3 block">Admin &amp; Business</span>
        <h1 className="t-display text-foreground">Office</h1>
      </div>

      {/* Hero: Top performing post or overview */}
      <div className="ie-border-t ie-border-b py-6 mb-8 animate-reveal-up delay-1">
        {!loading && topPost ? (
          <div>
            <span className="t-micro mb-2 block" style={{ color: 'var(--muted-foreground)' }}>
              BEST PERFORMER
            </span>
            <p className="text-lg font-bold text-foreground tracking-tight mb-1">
              {topPost.caption
                ? topPost.caption.substring(0, 80) + (topPost.caption.length > 80 ? '...' : '')
                : 'Your top performing content'
              }
            </p>
            <p className="t-body">
              {topPost.insight || 'This post outperformed your recent average. Ask Clio what to post next based on this.'}
            </p>
            <button
              className="btn-ie btn-ie-pill mt-4"
              onClick={() => navigate('/')}
            >
              <span className="btn-ie-text flex items-center gap-2">
                ASK CLIO WHAT TO DO NEXT
                <ArrowRight className="w-3 h-3" />
              </span>
            </button>
          </div>
        ) : (
          <div>
            <span className="t-micro mb-2 block" style={{ color: 'var(--muted-foreground)' }}>
              YOUR BUSINESS
            </span>
            <p className="text-lg font-bold text-foreground tracking-tight">
              Schedule, analyze, and grow
            </p>
            <p className="t-body mt-1">
              Everything about running the business side of your content. Scheduling and analytics.
            </p>
          </div>
        )}
      </div>

      {/* Tile drill-ins */}
      <div className="animate-reveal-up delay-2">
        <span className="t-micro mb-4 block" style={{ color: 'var(--muted-foreground)' }}>OPERATIONS</span>
        {tiles.map((tile, i) => {
          const Icon = tile.icon;
          return (
            <div
              key={tile.id}
              className="data-row cursor-pointer group"
              onClick={() => navigate(tile.path)}
            >
              <div className="flex items-center gap-4 flex-1">
                <span className="t-micro font-bold text-foreground" style={{ minWidth: '30px' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <Icon className="w-4 h-4 text-foreground" />
                <div>
                  <span className="text-sm font-semibold text-foreground">{tile.label.charAt(0) + tile.label.slice(1).toLowerCase()}</span>
                  <p className="t-body text-xs mt-0.5">{tile.description}</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
