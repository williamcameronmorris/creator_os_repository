import { ReactNode, useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { TokenHealthBanner } from './TokenHealthBanner';
import { ConnectionGateBanner } from './ConnectionGateBanner';
import { AccountSwitcher } from './AccountSwitcher';
import {
  Settings as SettingsIcon,
  LogOut,
  ChevronLeft,
  Sun,
  Moon,
  MessageCircle,
  PlayCircle,
  Handshake,
  SquarePen,
  Eye,
  Plus,
  Video,
} from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const [swipeProgress, setSwipeProgress] = useState(0);
  const [composeSheetOpen, setComposeSheetOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isSwipingBack = useRef(false);

  const getActiveTab = (): 'clio' | 'studio' | 'watch' | 'patra' | 'settings' => {
    const p = location.pathname;
    if (p === '/settings' || p === '/profile') return 'settings';
    if (p.startsWith('/watch')) return 'watch';
    // Studio now owns the full make→manage lifecycle: Schedule (04) and
    // Analytics (05) are reached from the Studio hub, so they highlight Studio.
    if (
      p.startsWith('/studio') ||
      p === '/media' ||
      p === '/saved-ideas' ||
      p.startsWith('/schedule') ||
      p.startsWith('/analytics') ||
      p === '/drop'
    ) {
      return 'studio';
    }
    if (p.startsWith('/patra')) return 'patra';
    return 'clio';
  };

  const activeTab = getActiveTab();
  const canGoBack = () => !['/', '/dashboard', '/clio'].includes(location.pathname);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      isSwipingBack.current = false;
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;
      if (!canGoBack()) return;
      const deltaX = e.touches[0].clientX - touchStartX.current;
      const deltaY = e.touches[0].clientY - touchStartY.current;
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        isSwipingBack.current = false;
        setSwipeProgress(0);
        return;
      }
      if (deltaX > 0) {
        setSwipeProgress(Math.min(deltaX / 300, 1));
        if (deltaX > 120) isSwipingBack.current = true;
      } else {
        setSwipeProgress(0);
        isSwipingBack.current = false;
      }
    };
    const handleTouchEnd = () => {
      if (isSwipingBack.current) navigate(-1);
      setSwipeProgress(0);
      touchStartX.current = null;
      touchStartY.current = null;
      isSwipingBack.current = false;
    };
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd);
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [location.pathname]);

  // Close the compose action sheet on Escape.
  useEffect(() => {
    if (!composeSheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setComposeSheetOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [composeSheetOpen]);

  const goCompose = (to: string) => {
    setComposeSheetOpen(false);
    navigate(to);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TokenHealthBanner />
      <ConnectionGateBanner />

      {/* Swipe back indicator */}
      {swipeProgress > 0 && (
        <>
          <div
            className="fixed inset-0 z-[60] pointer-events-none"
            style={{ opacity: swipeProgress * 0.15 }}
          />
          <div
            className="fixed left-4 top-1/2 z-[61] pointer-events-none"
            style={{
              transform: `translateX(${swipeProgress * 48 - 32}px) translateY(-50%)`,
              opacity: swipeProgress,
            }}
          >
            <ChevronLeft className="w-6 h-6 text-foreground" />
          </div>
        </>
      )}

      {/* Top header */}
      <header className="bg-background border-b border-border sticky top-0 z-50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12">

            {/* Wordmark */}
            <Link to="/" className="flex items-center gap-2 select-none group">
              <span
                className="font-sans font-bold text-lg tracking-tight text-foreground"
                style={{ letterSpacing: '-0.02em' }}
              >
                Cliopatra
              </span>
              <span
                className="font-mono text-[9px] font-medium tracking-widest text-muted-foreground uppercase"
                style={{ letterSpacing: '0.1em' }}
              >
                v0.5
              </span>
            </Link>

            {/* Right controls */}
            <div className="flex items-center gap-3">
              {/* Account scope for the whole app — voice, niche, analytics. */}
              <AccountSwitcher />
              <button
                onClick={toggleTheme}
                className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <Link
                to="/settings"
                className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <SettingsIcon className="w-4 h-4" />
              </Link>
              {user && (
                <button
                  onClick={() => signOut()}
                  className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 pb-20">
        {children}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50">
        <div className="flex items-center h-14">

          {/* Clio */}
          <Link
            to="/"
            className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
              activeTab === 'clio' ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            <MessageCircle className="w-5 h-5" />
            <span className="font-mono text-[8px] font-bold tracking-widest uppercase">Clio</span>
          </Link>

          {/* Studio */}
          <Link
            to="/studio"
            className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
              activeTab === 'studio' ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            <PlayCircle className="w-5 h-5" />
            <span className="font-mono text-[8px] font-bold tracking-widest uppercase">Studio</span>
          </Link>

          {/* Compose — opens a small action sheet (Quick post / Drop a video) */}
          <button
            onClick={() => setComposeSheetOpen(true)}
            aria-label="Create"
            aria-haspopup="menu"
            aria-expanded={composeSheetOpen}
            className="flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors text-muted-foreground"
          >
            <div
              className="w-8 h-8 flex items-center justify-center border border-foreground"
              style={{ background: 'var(--foreground)', color: 'var(--background)' }}
            >
              <Plus className="w-4 h-4" />
            </div>
            <span className="font-mono text-[8px] font-bold tracking-widest uppercase opacity-0">+</span>
          </button>

          {/* Watch */}
          <Link
            to="/watch"
            className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
              activeTab === 'watch' ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            <Eye className="w-5 h-5" />
            <span className="font-mono text-[8px] font-bold tracking-widest uppercase">Watch</span>
          </Link>

          {/* Patra */}
          <Link
            to="/patra"
            className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
              activeTab === 'patra' ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            <Handshake className="w-5 h-5" />
            <span className="font-mono text-[8px] font-bold tracking-widest uppercase">Patra</span>
          </Link>

        </div>
      </nav>

      {/* Compose action sheet — cream-industrial bottom sheet */}
      {composeSheetOpen && (
        <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Create">
          {/* Backdrop */}
          <button
            aria-label="Close"
            onClick={() => setComposeSheetOpen(false)}
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
          />
          {/* Sheet */}
          <div className="absolute bottom-0 left-0 right-0 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
            <div className="max-w-md mx-auto px-4 pt-4 pb-4">
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-border">
                <span className="t-micro">CREATE</span>
              </div>
              <button
                onClick={() => goCompose('/compose')}
                className="w-full flex items-center gap-3 py-4 border-b border-border text-left group"
              >
                <div className="w-9 h-9 flex-shrink-0 flex items-center justify-center border border-border group-hover:border-accent transition-colors">
                  <SquarePen className="w-4 h-4 text-foreground" />
                </div>
                <div>
                  <div className="font-mono text-[11px] font-bold tracking-widest uppercase text-foreground group-hover:text-accent transition-colors">
                    Quick post
                  </div>
                  <div className="t-micro mt-0.5">Write &amp; publish now</div>
                </div>
              </button>
              <button
                onClick={() => goCompose('/drop')}
                className="w-full flex items-center gap-3 py-4 text-left group"
              >
                <div className="w-9 h-9 flex-shrink-0 flex items-center justify-center border border-border group-hover:border-accent transition-colors">
                  <Video className="w-4 h-4 text-foreground" />
                </div>
                <div>
                  <div className="font-mono text-[11px] font-bold tracking-widest uppercase text-foreground group-hover:text-accent transition-colors">
                    Drop a video
                  </div>
                  <div className="t-micro mt-0.5">Turn footage into posts</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
