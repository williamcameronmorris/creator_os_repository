import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useBrand } from '../../contexts/BrandContext';
import { convertLead, listLeads, setLeadStatus, type MediaKitLeadRow } from '../../lib/mediaKitAdmin';
import { fmtDate } from '../../lib/mediaKit';

const ERROR_COLOR = '#B07050';

/**
 * Inbound brand enquiries from the public kit. Reading one marks it read;
 * "Convert" is the deliberate click that creates a prospect in the CRM.
 */
export function MediaKitLeads() {
  const { user } = useAuth();
  const { activeBrand } = useBrand();
  const [leads, setLeads] = useState<MediaKitLeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeBrand) return;
    try {
      setLeads(await listLeads(activeBrand.id));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [activeBrand]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (lead: MediaKitLeadRow, fn: () => Promise<unknown>) => {
    setBusyId(lead.id);
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const statusChip = (s: MediaKitLeadRow['status']) => {
    if (s === 'converted') return <span className="t-micro" style={{ color: 'var(--accent)' }}>CONVERTED</span>;
    if (s === 'spam') return <span className="t-micro text-muted-foreground">SPAM</span>;
    if (s === 'read') return <span className="t-micro text-muted-foreground">READ</span>;
    return <span className="t-micro text-foreground">NEW</span>;
  };

  if (loading) return <div className="py-8 text-center t-micro">LOADING&hellip;</div>;

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 border text-sm" style={{ borderColor: ERROR_COLOR, color: ERROR_COLOR }}>{error}</div>
      )}
      {leads.length === 0 ? (
        <p className="t-micro text-muted-foreground py-6">NO ENQUIRIES YET. THEY LAND HERE WHEN A BRAND USES THE FORM ON YOUR KIT.</p>
      ) : (
        <ul>
          {leads.map((l) => (
            <li key={l.id} className="py-4 border-b border-border">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-foreground font-medium" style={{ fontSize: '14.5px' }}>
                    {l.brand_name || l.contact_email}
                  </div>
                  <div className="t-micro mt-0.5 text-muted-foreground">
                    {[l.contact_name, l.budget_tier, fmtDate(l.created_at).toUpperCase()].filter(Boolean).join(' · ')}
                  </div>
                  <a href={`mailto:${l.contact_email}`} className="t-micro text-foreground hover:text-accent transition-colors">
                    {l.contact_email}
                  </a>
                  {l.message && <p className="text-sm text-foreground mt-2 whitespace-pre-line max-w-prose">{l.message}</p>}
                </div>
                <div className="shrink-0 text-right space-y-2">
                  {statusChip(l.status)}
                  <div className="flex flex-col items-end gap-1.5">
                    {l.status === 'new' && (
                      <button
                        onClick={() => act(l, () => setLeadStatus(l.id, 'read'))}
                        disabled={busyId === l.id}
                        className="t-micro text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                      >
                        MARK READ
                      </button>
                    )}
                    {l.status !== 'converted' && user && activeBrand && (
                      <button
                        onClick={() => act(l, () => convertLead(l, { userId: user.id, brandId: activeBrand.id }))}
                        disabled={busyId === l.id}
                        className="t-micro text-foreground hover:text-accent transition-colors disabled:opacity-50"
                      >
                        {busyId === l.id ? 'WORKING…' : 'CONVERT TO PROSPECT'}
                      </button>
                    )}
                    {l.status !== 'spam' && l.status !== 'converted' && (
                      <button
                        onClick={() => act(l, () => setLeadStatus(l.id, 'spam'))}
                        disabled={busyId === l.id}
                        className="t-micro text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                      >
                        SPAM
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
