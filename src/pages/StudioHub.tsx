import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowRight,
  Image,
  Bookmark,
  Sparkles,
  Plus,
} from 'lucide-react';

export function StudioHub() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [hasWorkflows, setHasWorkflows] = useState(false);
  const [latestWorkflow, setLatestWorkflow] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!user) { setLoading(false); return; }
      try {
        const { data } = await supabase
          .from('content_workflow_stages')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          setHasWorkflows(true);
          setLatestWorkflow(data);
        }
      } catch {
        // non-critical
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const tiles = [
    {
      id: 'workflow',
      icon: Sparkles,
      label: 'CONTENT WORKFLOW',
      description: 'Ideate, script, create, schedule, and analyze',
      path: '/studio/workflow',
    },
    {
      id: 'media',
      icon: Image,
      label: 'MEDIA LIBRARY',
      description: 'Your uploaded photos, videos, and assets',
      path: '/media',
    },
    {
      id: 'ideas',
      icon: Bookmark,
      label: 'SAVED IDEAS',
      description: 'Content ideas you\'ve bookmarked for later',
      path: '/saved-ideas',
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8 animate-reveal-up">
        <span className="t-micro accent-dot mb-3 block">Creative Hub</span>
        <h1 className="t-display text-foreground">Studio</h1>
      </div>

      {/* Hero: Continue or Start */}
      <div className="ie-border-t ie-border-b py-6 mb-8 animate-reveal-up delay-1">
        {!loading && hasWorkflows && latestWorkflow ? (
          /* Continue in progress */
          <div
            className="flex items-center justify-between cursor-pointer group"
            onClick={() => navigate('/studio/workflow')}
          >
            <div>
              <span className="t-micro mb-2 block" style={{ color: 'var(--muted-foreground)' }}>
                IN PROGRESS
              </span>
              <p className="text-lg font-bold text-foreground tracking-tight">
                {latestWorkflow.idea_content
                  ? latestWorkflow.idea_content.substring(0, 60) + (latestWorkflow.idea_content.length > 60 ? '...' : '')
                  : 'Untitled Project'
                }
              </p>
              <p className="t-body mt-1">
                Currently at the <strong className="text-foreground">{latestWorkflow.current_stage}</strong> stage
              </p>
            </div>
            <div className="btn-ie btn-ie-solid btn-ie-pill">
              <span className="btn-ie-text flex items-center gap-2">
                CONTINUE
                <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </div>
        ) : (
          /* Start fresh */
          <div
            className="flex items-center justify-between cursor-pointer group"
            onClick={() => navigate('/studio/workflow')}
          >
            <div>
              <span className="t-micro mb-2 block" style={{ color: 'var(--muted-foreground)' }}>
                READY TO CREATE
              </span>
              <p className="text-lg font-bold text-foreground tracking-tight">
                Start a new content piece
              </p>
              <p className="t-body mt-1">
                From idea to published post, Clio guides the whole process.
              </p>
            </div>
            <div className="btn-ie btn-ie-solid btn-ie-pill">
              <span className="btn-ie-text flex items-center gap-2">
                <Plus className="w-3 h-3" />
                NEW
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Tile drill-ins */}
      <div className="animate-reveal-up delay-2">
        <span className="t-micro mb-4 block" style={{ color: 'var(--muted-foreground)' }}>TOOLS</span>
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
