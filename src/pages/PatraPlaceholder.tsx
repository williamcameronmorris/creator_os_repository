/**
 * PLACEHOLDER — Patra (brand deals).
 *
 * This is a temporary stub so the `/patra` nav slot resolves on this branch.
 * The real Patra page ships in PR #26 (feat/patra-v1). On merge, PR #26 should
 * point the `/patra` route in App.tsx at its real page and delete this file.
 *
 * Keep this intentionally minimal — do not build product here.
 */
export function PatraPlaceholder() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <div className="t-micro mb-2">
        <span className="text-foreground">05</span>
        <span className="mx-2 text-muted-foreground">/</span>
        <span>PATRA</span>
      </div>
      <h1
        className="text-foreground mb-6"
        style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.05 }}
      >
        Brand{' '}
        <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>deals.</em>
      </h1>
      <div className="card-industrial p-6">
        <p className="t-micro mb-2">COMING SOON</p>
        <p className="t-body" style={{ maxWidth: '48ch' }}>
          Patra tracks your brand partnerships, outreach, and revenue. The full
          experience arrives shortly.
        </p>
      </div>
    </div>
  );
}
