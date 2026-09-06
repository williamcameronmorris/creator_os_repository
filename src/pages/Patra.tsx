import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { QuickQuote } from '../components/patra/QuickQuote';
import { DealsList } from '../components/patra/DealsList';
import { InvoicesPanel } from '../components/patra/InvoicesPanel';
import { MediaKitEditor } from '../components/patra/MediaKitEditor';

type PatraTab = 'quote' | 'deals' | 'invoices' | 'kit';

const TABS: { id: PatraTab; label: string }[] = [
  { id: 'quote', label: 'QUOTE' },
  { id: 'deals', label: 'DEALS' },
  { id: 'invoices', label: 'INVOICES' },
  { id: 'kit', label: 'MEDIA KIT' },
];

export function Patra() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = searchParams.get('tab');
  const [tab, setTab] = useState<PatraTab>(
    initial === 'deals' || initial === 'invoices' || initial === 'kit' ? initial : 'quote'
  );

  const switchTab = (next: PatraTab) => {
    setTab(next);
    setSearchParams(next === 'quote' ? {} : { tab: next }, { replace: true });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <div className="t-micro mb-2">
        <span className="text-foreground">05</span>
        <span className="mx-2 text-muted-foreground">/</span>
        <span>PATRA</span>
      </div>
      <h1
        className="text-foreground mb-10"
        style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.05 }}
      >
        Brand deals,{' '}
        <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>priced right.</em>
      </h1>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-border mb-8">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => switchTab(t.id)}
            className={`t-micro pb-3 -mb-px border-b transition-colors ${
              tab === t.id
                ? 'text-foreground border-foreground'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
            style={tab === t.id ? { borderColor: 'var(--accent)', color: 'var(--foreground)' } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'quote' && <QuickQuote onDealSaved={() => switchTab('deals')} />}
      {tab === 'deals' && <DealsList />}
      {tab === 'invoices' && <InvoicesPanel />}
      {tab === 'kit' && <MediaKitEditor />}
    </div>
  );
}
