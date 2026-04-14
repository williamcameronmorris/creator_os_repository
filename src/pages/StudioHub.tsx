import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ArrowRight, Pencil, FileText, Mic, Zap } from 'lucide-react';

interface DraftItem {
  id: string;
  title: string;
  updated_at: string;
  platform?: string;
}

export function StudioHub() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [recentDrafts, setRecentDrafts] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from('scripts')
        .select('id, title, updated_at, platform')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(5);
      setRecentDrafts(data || []);
      setLoading(false);
    };
    load();
  }, [user]);

  const formatWhen = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diff === 0) return 'TODAY';
    if (diff === 1) return 'YESTERDAY';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  };

  const tiles = [
    {
      index: '01',
      label: 'SCRIPT',
      icon: Pencil,
      title: 'New Script',
      sub: 'Start from a blank page or let Clio generate a first draft from your idea.',
      cta: 'Open editor',
      action: () => navigate('/studio/script'),
    },
    {
      index: '02',
      label: 'TEMPLATES',
      icon: FileText,
      title: 'Templates',
      sub: 'Hook frameworks, story structures, and scripting systems for every format.',
      cta: 'Browse',
      action: () => navigate('/studio/templates'),
    },
    {
      index: '03',
      label: 'MEDIA',
      icon: Mic,
      title: 'Media',
      sub: 'Your recordings, b-roll notes, and assets — organized by project.',
      cta: 'View library',
      action: () => navigate('/media'),
    },
    {
      index: '04',
      label: 'IDEAS',
      icon: Zap,
      title: 'Saved Ideas',
      sub: 'Concepts and angles Clio surfaced that you haven\u2019t acted on yet.',
      cta: 'Review',
      action: () => navigate('/saved-ideas'),
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">

      {/* Section marker + title */}
      <div className="t-micro mb-2">
        <span className="text-foreground">02</span>
        <span className="mx-2 text-muted-foreground">/</span>
        <span>STUDIO</span>
      </div>
      <h1
        className="text-foreground mb-12"
        style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.05 }}
      >
        Write, produce,{' '}
        <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>and publish.</em>
      </h1>

      {/* Asymmetric layout: 35 / 65 */}
      <div
        className="grid gap-10 items-start"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
      >
        {/* Left: recent drafts */}
        <aside>
          <div className="flex items-center justify-between pb-3 border-b border-border mb-1">
            <span className="t-micro">RECENT DRAFTS</span>
            <span className="t-micro text-foreground">{recentDrafts.length}</span>
          </div>

          {loading ? (
            <div className="py-10 text-center t-micro">LOADING&hellip;</div>
          ) : recentDrafts.length === 0 ? (
            <div className="py-10 text-center">
              <p className="t-micro mb-4">NO DRAFTS YET</p>
              <button
                onClick={() => navigate('/studio/script')}
                className="btn-ie"
              >
                <span className="btn-ie-text">Start your first script</span>
              </button>
            </div>
          ) : (
            <div>
              {recentDrafts.map((draft) => (
                <button
                  key={draft.id}
                  onClick={() => navigate(`/studio/script/${draft.id}`)}
                  className="w-full text-left group"
                >
                  <div className="grid gap-3 py-4 border-b border-border hover:bg-transparent transition-colors"
                    style={{ gridTemplateColumns: '56px 1fr auto', alignItems: 'baseline' }}>
                    <span className="t-micro">{formatWhen(draft.updated_at)}</span>
                    <div>
                      <div
                        className="text-foreground font-medium group-hover:text-accent transition-colors"
                        style={{ fontSize: '14.5px', lineHeight: 1.35 }}
                      >
                        {draft.title || 'Untitled draft'}
                      </div>
                      {draft.platform && (
                        <div className="t-micro mt-0.5">{draft.platform.toUpperCase()}</div>
                      )}
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-accent transition-colors opacity-0 group-hover:opacity-100" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* Right: tile grid */}
        <div>
          <div className="grid grid-cols-2 gap-4">
            {tiles.map((tile) => {
              const Icon = tile.icon;
              return (
                <button
                  key={tile.index}
                  onClick={tile.action}
                  className="card-industrial p-6 text-left flex flex-col gap-4 group cursor-pointer"
                  style={{ minHeight: 220 }}
                >
                  <div className="flex items-center justify-between">
                    <span className="t-micro">{tile.index} · {tile.label}</span>
                    <Icon className="w-4 h-4 text-muted-foreground group-hover:text-accent transition-colors" />
                  </div>
                  <div className="flex-1">
                    <div
                      className="text-foreground font-semibold mb-2"
                      style={{ fontSize: '1.25rem', letterSpacing: '-0.015em' }}
                    >
                      {tile.title}
                    </div>
                    <div className="t-body" style={{ maxWidth: '28ch' }}>{tile.sub}</div>
                  </div>
                  <span className="t-micro text-foreground group-hover:text-accent transition-colors flex items-center gap-2">
                    {tile.cta}
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
