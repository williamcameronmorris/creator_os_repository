import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ArrowRight, Lightbulb, Pencil, Video, Calendar, BarChart3 } from 'lucide-react';

interface DraftItem {
  id: string;
  title: string;
  updated_at: string;
  platform?: string;
}

interface SubTool {
  label: string;
  to: string;
}

interface LifecycleTile {
  index: string;
  label: string;
  icon: typeof Lightbulb;
  title: string;
  sub: string;
  cta: string;
  to: string;
  subs?: SubTool[];
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

  // 01–03 = the "make" band (idea → script → create).
  const makeTiles: LifecycleTile[] = [
    {
      index: '01',
      label: 'IDEATE',
      icon: Lightbulb,
      title: 'Ideate',
      sub: 'Analyze what’s working and turn a raw angle into a workflow.',
      cta: 'Start ideation',
      to: '/studio/workflow',
      subs: [
        { label: 'Saved Ideas', to: '/saved-ideas' },
        { label: '30-Day Challenge', to: '/studio/challenge' },
      ],
    },
    {
      index: '02',
      label: 'SCRIPT',
      icon: Pencil,
      title: 'Script',
      sub: 'Draft your hook, body, and CTA — blank page or Clio first draft.',
      cta: 'Open editor',
      to: '/studio/script',
      subs: [{ label: 'Templates', to: '/studio/templates' }],
    },
    {
      index: '03',
      label: 'CREATE',
      icon: Video,
      title: 'Create',
      sub: 'Bring in footage, b-roll, and assets — organized by project.',
      cta: 'Open media',
      to: '/media',
      subs: [
        { label: 'Media', to: '/media' },
        { label: 'Drop Zone', to: '/drop' },
      ],
    },
  ];

  // 04–05 = the "manage" band (schedule → analyze), the aggregate views.
  const manageTiles: LifecycleTile[] = [
    {
      index: '04',
      label: 'SCHEDULE',
      icon: Calendar,
      title: 'Schedule',
      sub: 'The aggregate calendar — drag-and-drop across every connected platform.',
      cta: 'Open calendar',
      to: '/schedule',
    },
    {
      index: '05',
      label: 'ANALYZE',
      icon: BarChart3,
      title: 'Analyze',
      sub: 'The aggregate dashboard — cross-platform performance and what’s compounding.',
      cta: 'View report',
      to: '/analytics',
    },
  ];

  const renderTile = (tile: LifecycleTile) => {
    const Icon = tile.icon;
    return (
      <div
        key={tile.index}
        className="card-industrial p-6 text-left flex flex-col gap-4"
        style={{ minHeight: 220 }}
      >
        <button onClick={() => navigate(tile.to)} className="text-left flex-1 flex flex-col gap-4 group cursor-pointer">
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

        {tile.subs && tile.subs.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
            {tile.subs.map((s) => (
              <button
                key={s.to + s.label}
                onClick={() => navigate(s.to)}
                className="t-micro px-2 py-1 border border-border text-muted-foreground hover:text-accent hover:border-accent transition-colors"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">

      {/* Section marker + title */}
      <div className="t-micro mb-2">
        <span className="text-foreground">02</span>
        <span className="mx-2 text-muted-foreground">/</span>
        <span>STUDIO</span>
      </div>
      <h1
        className="text-foreground mb-10"
        style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.05 }}
      >
        Idea to{' '}
        <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>analytics.</em>
      </h1>

      {/* Drafts strip — continue a draft (Decision 3: hub opens with drafts up top) */}
      <section className="mb-12">
        <div className="flex items-center justify-between pb-3 border-b border-border mb-1">
          <span className="t-micro">CONTINUE A DRAFT</span>
          <span className="t-micro text-foreground">{recentDrafts.length}</span>
        </div>

        {loading ? (
          <div className="py-8 text-center t-micro">LOADING&hellip;</div>
        ) : recentDrafts.length === 0 ? (
          <div className="py-8 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
            <p className="t-micro">NO DRAFTS YET</p>
            <button onClick={() => navigate('/studio/script')} className="btn-ie">
              <span className="btn-ie-text">Start your first script</span>
            </button>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
            {recentDrafts.map((draft) => (
              <button
                key={draft.id}
                onClick={() => navigate(`/studio/script/${draft.id}`)}
                className="flex-shrink-0 text-left card-industrial p-4 group"
                style={{ width: 200 }}
              >
                <div className="t-micro mb-2">{formatWhen(draft.updated_at)}</div>
                <div
                  className="text-foreground font-medium group-hover:text-accent transition-colors line-clamp-2"
                  style={{ fontSize: '14px', lineHeight: 1.35, minHeight: '2.7em' }}
                >
                  {draft.title || 'Untitled draft'}
                </div>
                {draft.platform && (
                  <div className="t-micro mt-2">{draft.platform.toUpperCase()}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* MAKE band — 01–03 */}
      <div className="t-micro mb-4 text-muted-foreground">MAKE</div>
      <div className="grid gap-4 mb-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {makeTiles.map(renderTile)}
      </div>

      {/* MANAGE band — 04–05 (aggregate views) */}
      <div className="t-micro mb-4 text-muted-foreground border-t border-border pt-8">MANAGE</div>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {manageTiles.map(renderTile)}
      </div>
    </div>
  );
}
