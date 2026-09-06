import { useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { Eyebrow, Panel } from '../ui/tac';
import { Button } from '../ui/Button';
import { submitLead, type PublicKit } from '../../lib/mediaKit';

const BUDGETS = ['Under $500', '$500 – $2,000', '$2,000 – $10,000', '$10,000+', 'Not sure yet'];

const field =
  'w-full px-3 py-2 bg-background border border-border text-foreground text-sm focus:outline-none focus:border-accent transition-colors';

/**
 * Lead capture. The message lands in the creator's Patra inbox, never in a
 * mailbox they have to remember to check. A hidden "website" field is the
 * honeypot: real browsers leave it empty, and the function silently accepts
 * anything that fills it.
 */
export function ContactForm({ slug, kit }: { slug: string; kit: PublicKit['kit'] }) {
  const [form, setForm] = useState({ brand_name: '', contact_name: '', contact_email: '', budget_tier: '', message: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstName = kit.display_name?.split(' ')[0] ?? 'They';

  if (kit.contact.mode === 'email' && kit.contact.email) {
    return (
      <Panel className="p-5">
        <Eyebrow>CONTACT</Eyebrow>
        <a
          href={`mailto:${kit.contact.email}`}
          className="mt-3 inline-flex items-center gap-2 t-micro text-foreground hover:text-accent transition-colors"
        >
          {kit.contact.label.toUpperCase()} <ArrowRight className="w-3 h-3" />
        </a>
      </Panel>
    );
  }
  if (kit.contact.mode === 'link' && kit.contact.url) {
    return (
      <Panel className="p-5">
        <Eyebrow>CONTACT</Eyebrow>
        <a
          href={kit.contact.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 t-micro text-foreground hover:text-accent transition-colors"
        >
          {kit.contact.label.toUpperCase()} <ArrowRight className="w-3 h-3" />
        </a>
      </Panel>
    );
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await submitLead(slug, form);
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="p-5">
      <Eyebrow>CONTACT</Eyebrow>
      <h3 className="text-lg font-black uppercase tracking-tight text-foreground mt-2">{kit.contact.label}</h3>
      {sent ? (
        <p className="text-sm text-foreground mt-3">Sent. {firstName} will get back to you.</p>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 space-y-3" noValidate>
          <div className="grid sm:grid-cols-2 gap-3">
            <input className={field} placeholder="Brand" value={form.brand_name} onChange={set('brand_name')} maxLength={120} />
            <input className={field} placeholder="Your name" value={form.contact_name} onChange={set('contact_name')} maxLength={120} />
          </div>
          <input
            className={field}
            type="email"
            placeholder="Email"
            required
            value={form.contact_email}
            onChange={set('contact_email')}
            maxLength={200}
            aria-label="Email"
          />
          <select className={field} value={form.budget_tier} onChange={set('budget_tier')} aria-label="Budget">
            <option value="">Budget</option>
            {BUDGETS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <textarea
            className={`${field} min-h-[110px]`}
            placeholder="What are you thinking?"
            value={form.message}
            onChange={set('message')}
            maxLength={2000}
            aria-label="Message"
          />
          {/* Honeypot. Off-screen, not focusable, not announced. */}
          <input
            name="website"
            value={form.website}
            onChange={set('website')}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute -left-[9999px] w-px h-px opacity-0"
          />
          {error && (
            <p className="t-micro" style={{ color: 'var(--destructive, #c44)' }}>{error}</p>
          )}
          <Button type="submit" variant="primary" disabled={busy || !form.contact_email}>
            {busy ? 'SENDING…' : 'SEND'}
          </Button>
        </form>
      )}
    </Panel>
  );
}
