import type { ReactNode } from 'react';

/**
 * TAC light-mode primitives.
 *
 * Lifted from the Starter Kit to Content Creation PDF, which is the brand's
 * dark/light hybrid system. Three devices carry the whole look:
 *
 *   Eyebrow      gold letterspaced micro label   ("01 · VERDICT")
 *   SectionHead  heavy sans, final word in gold serif italic
 *   Takeaway     inverted block holding exactly one sentence
 *
 * Gold stays scarce on purpose: eyebrows, the accent italic, numerals, and one
 * CTA border. Never on a dismiss action.
 */

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="t-micro" style={{ color: 'var(--accent)' }}>
      {children}
    </p>
  );
}

/**
 * Heading where the last word carries a gold serif italic. Pass the accent
 * separately rather than parsing the string, so the split is always deliberate.
 */
export function SectionHead({ children, accent }: { children: ReactNode; accent: string }) {
  return (
    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight">
      {children}{' '}
      <span className="t-accent">{accent}</span>
    </h2>
  );
}

/**
 * The "this is the point" block: inverted against the page in both themes.
 * One sentence. If it needs two, it is not a takeaway.
 */
export function Takeaway({ children }: { children: ReactNode }) {
  return (
    <div
      className="px-5 py-4"
      style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
    >
      <p className="text-sm leading-relaxed">{children}</p>
    </div>
  );
}

/**
 * The cover stat treatment: large numeral over a tiny letterspaced label.
 * `tone="accent"` reserves gold for the one number that matters in a row.
 */
export function StatNumber({
  value,
  label,
  tone = 'default',
  hint,
}: {
  value: ReactNode;
  label: string;
  tone?: 'default' | 'accent';
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <div
        className="text-3xl sm:text-4xl font-bold tabular-nums leading-none truncate"
        style={{ color: tone === 'accent' ? 'var(--accent)' : 'var(--foreground)' }}
        title={hint}
      >
        {value}
      </div>
      <p className="t-micro mt-2 truncate">{label}</p>
    </div>
  );
}

/** Bordered card on paper: 1px hairline, square corners, no shadow. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`border border-border bg-card ${className}`}>{children}</section>
  );
}
