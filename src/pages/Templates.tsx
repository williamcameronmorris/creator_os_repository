import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';

/**
 * Templates — placeholder route for /studio/templates.
 *
 * Real script-template library (hook frameworks, story structures) ships later.
 * Until then, route exists so Studio's "Templates" tile doesn't redirect home.
 */
export function Templates() {
  const navigate = useNavigate();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <div className="t-micro mb-2">
        <span className="text-foreground">02</span>
        <span className="mx-2 text-muted-foreground">/</span>
        <span>STUDIO · TEMPLATES</span>
      </div>

      <h1
        className="text-foreground mb-2"
        style={{
          fontSize: 'clamp(2rem, 5vw, 3.5rem)',
          fontWeight: 500,
          letterSpacing: '-0.03em',
          lineHeight: 1.05,
        }}
      >
        Hook frameworks{' '}
        <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>coming soon.</em>
      </h1>
      <p className="t-body mb-10" style={{ maxWidth: '52ch' }}>
        A curated library of hook frameworks, story structures, and scripting systems for
        every format. We're shipping the first batch shortly. In the meantime, start a
        blank script and Clio will help you outline.
      </p>

      <div
        className="card-industrial p-6 flex items-start gap-4 mb-8"
        style={{ borderLeft: '2px solid var(--accent)' }}
      >
        <div className="w-10 h-10 border border-border flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5" />
        </div>
        <div>
          <div className="text-foreground font-semibold mb-1" style={{ fontSize: '15px' }}>
            What's coming
          </div>
          <ul className="t-body" style={{ maxWidth: '52ch', listStyle: 'disc', paddingLeft: '1.25rem', lineHeight: 1.7 }}>
            <li>Hook frameworks — opening lines that earn the next 3 seconds</li>
            <li>Story structures — three-act, problem-solution, pattern-interrupt</li>
            <li>Format-specific templates — Reels, Shorts, long-form YouTube, Threads</li>
            <li>Reusable script blocks you save and remix</li>
          </ul>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => navigate('/studio/script')} className="btn-ie">
          <span className="btn-ie-text">Start a blank script</span>
        </button>
        <button
          onClick={() => navigate('/studio')}
          className="t-micro inline-flex items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          BACK TO STUDIO
        </button>
      </div>
    </div>
  );
}
