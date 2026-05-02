import { ReactNode, useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { TokenHealthBanner } from './TokenHealthBanner';
import { ConnectionGateBanner } from './ConnectionGateBanner';
import {
  Settings as SettingsIcon,
  LogOut,
  ChevronLeft,
  Sun,
  Moon,
  MessageCircle,
  PlayCircle,
  Briefcase,
  SquarePen,
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

  const getActiveTab = (): 'clio' | 'studio' | 'office' | 'settings' => {
    const p = location.pathname;
    if (p === '/settings' || p === '/profile') return 'settings';
    if (p.startsWith('/studio') || p === '/media' || p === '/saved-ideas') return 'studio';
    if (p.startsWith('/office') || p === '/schedule' || p === '/analytics' || p.startsWith('/daily-pulse')) return 'office';
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

          {/* Compose */}
          <Link
            to="/compose"
            className="flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors text-muted-foreground"
          >
            <div
              className="w-8 h-8 flex items-center justify-center border border-foreground"
              style={{ background: 'var(--foreground)', color: 'var(--background)' }}
            >
              <SquarePen className="w-3.5 h-3.5" />
            </div>
            <span className="font-mono text-[8px] font-bold tracking-widest uppercase opacity-0">+</span>
          </Link>

          {/* Office */}
          <Link
            to="/office"
            className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
              activeTab === 'office' ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            <Briefcase className="w-5 h-5" />
            <span className="font-mono text-[8px] font-bold tracking-widest uppercase">Office</span>
          </Link>

          {/* Settings */}
          <Link
            to="/settings"
            className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
              activeTab === 'settings' ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            <SettingsIcon className="w-5 h-5" />
            <span className="font-mono text-[8px] font-bold tracking-widest uppercase">Settings</span>
          </Link>

        </div>
      </nav>
    </div>
  );
}
