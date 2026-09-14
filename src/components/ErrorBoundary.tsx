import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /**
   * 'app' (default) covers the whole screen and is mounted once around the
   * router. 'page' sits inside Layout so a crash on one screen keeps the
   * header and bottom nav, and navigating away clears it.
   */
  variant?: 'app' | 'page';
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Log a caught render error somewhere useful without leaking anything to the
 * screen. Console only for now; the message and component stack are enough
 * to find the cause in DevTools or the mobile shell's log.
 *
 * TODO(sentry): forward to Sentry once a DSN is set. Keep the user-facing copy
 * generic either way; error.message is for us, not for them.
 */
function reportError(error: Error, info: ErrorInfo) {
  console.error('[ErrorBoundary]', error.name, error.message);
  if (info.componentStack) console.error(info.componentStack);
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    const page = this.props.variant === 'page';

    return (
      <div className={page ? 'px-4 py-16 flex items-center justify-center' : 'min-h-screen flex items-center justify-center bg-background px-4'}>
        <div className="w-full max-w-md bg-card border border-border p-8 text-center">
          <div className="flex items-center justify-center mb-6">
            <div className="w-12 h-12 border border-border flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" style={{ color: 'var(--destructive)' }} />
            </div>
          </div>
          <h2 className="text-foreground mb-2" style={{ fontSize: '1.375rem', fontWeight: 500, letterSpacing: '-0.02em' }}>
            Something went wrong
          </h2>
          <p className="t-body mb-6">
            {page
              ? 'This screen hit a problem. Try again, or open another tab and come back.'
              : 'The app hit a problem it could not recover from. Try again, and if it keeps happening, reload the page.'}
          </p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={this.reset} className="btn-ie btn-ie-solid inline-flex items-center gap-2">
              <RotateCw className="w-3 h-3" />
              <span className="btn-ie-text">Try again</span>
            </button>
            {!page && (
              <a href="/" className="t-micro text-muted-foreground hover:text-foreground transition-colors">
                Reload
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }
}
