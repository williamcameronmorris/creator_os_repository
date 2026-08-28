import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Check, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/Button';
import {
  fetchDataHealth,
  diagnose,
  type DataHealth,
  type Finding,
} from '../lib/dataHealth';

/**
 * Explains why a screen is empty, using facts the app already had.
 *
 * Shown in place of a generic empty state. The old one said "Connect your
 * accounts in Settings" regardless of cause, which on 2026-08-22 was both
 * untrue and pointed at a page that does not hold connections.
 */

function Icon({ severity }: { severity: Finding['severity'] }) {
  if (severity === 'ok') return <Check className="w-4 h-4 shrink-0 mt-0.5" />;
  if (severity === 'warning')
    return <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />;
  return <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />;
}

export function DataHealthPanel({
  postsInWindow,
  windowLabel,
  compact = false,
}: {
  postsInWindow?: number;
  windowLabel?: string;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [health, setHealth] = useState<DataHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    fetchDataHealth(user.id)
      .then(setHealth)
      .finally(() => setLoading(false));
  }, [user]);

  if (loading || !health) return null;

  const findings = diagnose(health, { postsInWindow, windowLabel });
  // Compact mode is for a healthy page that just needs a quiet status line;
  // there is no reason to interrupt someone whose data is fine.
  const shown = compact ? findings.filter((f) => f.severity !== 'ok') : findings;
  if (shown.length === 0) return null;

  return (
    <section className="border border-border bg-card">
      <header className="px-5 pt-5 pb-3">
        <p className="t-micro">
          {shown[0].severity === 'ok' ? 'Data health' : 'Why this looks empty'}
        </p>
      </header>
      <ul>
        {shown.map((f) => (
          <li
            key={f.id}
            className="px-5 py-4 border-t border-border flex items-start gap-3"
          >
            <Icon severity={f.severity} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{f.title}</p>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{f.detail}</p>
              {f.action && (
                <div className="mt-3">
                  <Button size="sm" onClick={() => navigate(f.action!.to)}>
                    {f.action.label}
                  </Button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
