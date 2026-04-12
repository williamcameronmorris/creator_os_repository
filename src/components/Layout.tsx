import { ReactNode, useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { TokenHealthBanner } from './TokenHealthBanner';
import {
  Settings as SettingsIcon,
  LogOut,
  ChevronLeft,
  Sun,
  Moon,
  MessageCircle,
  Sparkles,
  Briefcase,
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
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isSwipingBack = useRef(false);

  // Determine active tab from current path
  const getActiveTab = (): 'clio' | 'studio' | 'office' | 'settings' => {
    const p = location.pathname;
    if (p === '/settings' || p === '/profile') return 'settings';
    if (p.startsWith('/studio') || p === '/media' || p === '/saved-ideas') return 'studio';
    if (p.startsWith('/office') || p === '/schedule' || p === '/analytics' || p.startsWith('/deals') || p === '/revenue' || p === '/pipeline') return 'office';
    return 'clio';
  };

  const activeTab = getActiveTab();
  const canGoBack = () => !['/', '/dashboard', '/clio'].includes(location.pathname);

  // Swipe-back gesture
  const handleTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    if (touch.clientX <= 50 && canGoBack()) isSwipingBack.current = true;
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isSwipingBack.current || touchStartX.current === null || touchStartY.current === null) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = touch.clientY - touchStartY.current;
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      isSwipingBack.current = false;
      setSwipeProgress(0);
      return;
    }
    if (deltaX > 0) {
      setSwipeProgress(Math.min(deltaX / 300, 1));
      if (deltaX > 10) e.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    if (!isSwipingBack.current) return;
    if (swipeProgress > 0.4) navigate(-1);
    isSwipingBack.current = false;
    setSwipeProgress(0);
    touchStartX.current = null;
    touchStartY.current = null;
  };

  useEffect(() => {
    const s = (e: TouchEvent) => handleTouchStart(e);
    const m = (e: TouchEvent) => handleTouchMove(e);
    const en = () => handleTouchEnd();
    document.addEventListener('touchstart', s, { passive: false });
    document.addEventListener('touchmove', m, { passive: false });
    document.addEventListener('touchend', en);
    return () => {
      document.removeEventListener('touchstart', s);
      document.removeEventListener('touchmove', m);
      document.removeEventListener('touchend', en);
    };
  }, [location.pathname, swipeProgress]);

  return (
    <div className="min-h-screen bg-background pb-14 lg:pb-0">
      {/* Noise overlay */}
      <div className="noise-overlay" />

      {/* Swipe-back indicator */}
      {swipeProgress > 0 && (
        <>
          <div
            className="fixed inset-0 bg-black z-[60] pointer-events-none"
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

      {/* ── Top header ──────────────────────────────── */}
      <header className="bg-background border-b border-border sticky top-0 z-50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5 select-none group">
              <div className="w-1.5 h-1.5 bg-foreground group-hover:scale-125 transition-transform" />
              <span className="font-mono text-[10px] font-bold tracking-[0.08em] uppercase text-foreground">
                Creator Command
              </span>
            </Link>

            {/* Desktop nav links (center) */}
            <nav className="hidden lg:flex items-center gap-8">
              {[
                { to: '/', label: 'Clio', tab: 'clio' as const },
                { to: '/studio', label: 'Studio', tab: 'studio' as const },
                { to: '/office', label: 'Office', tab: 'office' as const },
              ].map(({ to, label, tab }) => (
                <Link
                  key={tab}
                  to={to}
                  className={`font-mono text-[10px] font-bold tracking-[0.08em] uppercase relative py-1 transition-colors ${
                    activeTab === tab
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                  {activeTab === tab && (
                    <span className="absolute bottom-0 left-0 w-full h-px bg-foreground" />
                  )}
                </Link>
              ))}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-3">
              <button
                onClick={toggleTheme}
                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              >
                {theme === 'dark'
                  ? <Sun className="w-3.5 h-3.5" />
                  : <Moon className="w-3.5 h-3.5" />
                }
              </button>
              <Link
                to="/settings"
                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors hidden lg:block"
              >
                <SettingsIcon className="w-3.5 h-3.5" />
              </Link>
              <button
                onClick={() => signOut()}
                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors hidden lg:block"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────── */}
      <main className="min-w-0 overflow-x-hidden">
        <TokenHealthBanner />
        {children}
      </main>

      {/* ── Mobile bottom nav: 3 tabs + gear ─────────── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50 lg:hidden">
        <div className="flex items-center h-14">
          {/* Clio */}
          <Link
            to="/"
            className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
              activeTab === 'clio' ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            <MessageCircle className="w-5 h-5" />
            <span className="font-mono text-[8px] font-bold tracking-[0.1em] uppercase">Clio</span>
          </Link>

          {/* Studio */}
          <Link
            to="/studio"
            className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
              activeTab === 'studio' ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            <Sparkles className="w-5 h-5" />
            <span className="font-mono text-[8px] font-bold tracking-[0.1em] uppercase">Studio</span>
          </Link>

          {/* Office */}
          <Link
            to="/office"
            className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
              activeTab === 'office' ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            <Briefcase className="w-5 h-5" />
            <span className="font-mono text-[8px] font-bold tracking-[0.1em] uppercase">Office</span>
          </Link>

          {/* Settings gear */}
          <Link
            to="/settings"
            className={`flex flex-col items-center justify-center w-14 h-full gap-1 transition-colors ${
              activeTab === 'settings' ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            <SettingsIcon className="w-5 h-5" />
            <span className="font-mono text-[8px] font-bold tracking-[0.1em] uppercase">
              {/* intentionally no label for gear, just icon */}
            </span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
