import { ReactNode, useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { TokenHealthBanner } from './TokenHealthBanner';
import {
  Home,
  Settings as SettingsIcon,
  LogOut,
  Calendar,
  Image,
  TrendingUp,
  User,
  ChevronLeft,
  X,
  Sparkles,
  Bookmark,
  Video,
  MessageCircle,
  Repeat2,
  Sun,
  Moon,
} from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface NavItem {
  path: string;
  label: string;
  icon: any;
}

type BottomNavTab = 'studio' | 'settings' | null;

export function Layout({ children }: LayoutProps) {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeBottomTab, setActiveBottomTab] = useState<BottomNavTab>(null);

  const [swipeProgress, setSwipeProgress] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isSwipingBack = useRef(false);

  const navigationSections: NavSection[] = [
    {
      title: 'Headquarters',
      items: [
        { path: '/dashboard', label: 'Daily Pulse', icon: Home },
      ],
    },
    {
      title: 'Studio',
      items: [
        { path: '/studio',      label: 'Content Workflow',  icon: Video },
        { path: '/schedule',    label: 'Content Schedule',  icon: Calendar },
        { path: '/saved-ideas', label: 'Saved Ideas',       icon: Bookmark },
        { path: '/media',       label: 'Media Library',     icon: Image },
        { path: '/analytics',   label: 'Audience Growth',   icon: TrendingUp },
        { path: '/inbox',       label: 'Comment Inbox',     icon: MessageCircle },
        { path: '/repurpose',   label: 'Repurpose Content', icon: Repeat2 },
      ],
    },
    {
      title: 'Account',
      items: [
        { path: '/profile',  label: 'Profile',  icon: User },
        { path: '/settings', label: 'Settings', icon: SettingsIcon },
      ],
    },
  ];

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const closeBottomNav = () => setActiveBottomTab(null);
  const openBottomTab = (tab: BottomNavTab) =>
    setActiveBottomTab(activeBottomTab === tab ? null : tab);
  const canGoBack = () => !['/', '/dashboard'].includes(location.pathname);

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

  const userInitial = user?.email?.[0]?.toUpperCase() ?? '?';

  const renderNavLinks = (section: NavSection, onClick?: () => void) =>
    section.items.map((item) => {
      const Icon = item.icon;
      const active = isActive(item.path);
      return (
        <Link
          key={item.path}
          to={item.path}
          onClick={onClick}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
            active
              ? 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
        >
          <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-primary' : ''}`} />
          {item.label}
        </Link>
      );
    });

  const renderBottomNavContent = () => {
    if (!activeBottomTab) return null;

    const sectionMap: Record<NonNullable<BottomNavTab>, NavSection> = {
      studio: navigationSections[1],
      settings: navigationSections[2],
    };
    const section = sectionMap[activeBottomTab];
    const title = activeBottomTab === 'studio' ? 'Studio' : 'Account';

    return (
      <>
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm" onClick={closeBottomNav} />
        <div className="fixed bottom-16 left-0 right-0 bg-card border-t border-border z-50 lg:hidden max-h-[65vh] overflow-y-auto rounded-t-2xl shadow-2xl">
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              <button
                onClick={closeBottomNav}
                className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-0.5">
              {renderNavLinks(section, closeBottomNav)}
              {activeBottomTab === 'settings' && (
                <>
                  <div className="border-t border-border my-3" />
                  <button
                    onClick={() => { signOut(); closeBottomNav(); }}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg w-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                  >
                    <LogOut className="w-4 h-4 flex-shrink-0" />
                    Sign Out
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-16 lg:pb-0">
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
            <ChevronLeft className="w-7 h-7 text-primary" />
          </div>
        </>
      )}

      {/* ── Top header ──────────────────────────────────── */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link to="/dashboard" className="flex items-center gap-2 select-none group">
              <div className="w-2 h-2 rounded-full bg-primary group-hover:scale-110 transition-transform" />
              <span className="text-[15px] font-semibold tracking-tight text-foreground">
                Creator Command
              </span>
            </Link>

            {/* Desktop right side */}
            <div className="hidden lg:flex items-center gap-2">
              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark'
                  ? <Sun className="w-4 h-4" />
                  : <Moon className="w-4 h-4" />
                }
              </button>
              <span className="text-xs text-muted-foreground truncate max-w-[160px]">
                {user?.email}
              </span>
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold select-none">
                {userInitial}
              </div>
            </div>

            {/* Mobile right side */}
            <div className="lg:hidden flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                {theme === 'dark'
                  ? <Sun className="w-4 h-4" />
                  : <Moon className="w-4 h-4" />
                }
              </button>
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold select-none">
                {userInitial}
              </div>
            </div>
          </div>
        </div>
      </header>

      {renderBottomNavContent()}

      <div className="flex overflow-x-hidden">
        {/* ── Desktop sidebar ──────────────────────────── */}
        <aside className="w-56 bg-sidebar border-r border-sidebar-border min-h-[calc(100vh-3.5rem)] hidden lg:flex flex-col flex-shrink-0">
          <nav className="flex-1 p-3 space-y-5 overflow-y-auto">
            {navigationSections.map((section) => (
              <div key={section.title}>
                <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase px-3 mb-1.5">
                  {section.title}
                </p>
                <div className="space-y-0.5">
                  {renderNavLinks(section)}
                </div>
              </div>
            ))}
          </nav>

          {/* Sidebar footer */}
          <div className="p-3 border-t border-sidebar-border">
            <button
              onClick={() => signOut()}
              className="flex items-center gap-3 px-3 py-2 rounded-lg w-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────── */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0 overflow-x-hidden">
          <TokenHealthBanner />
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav ────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 lg:hidden">
        <div className="flex items-center justify-around h-14">
          <Link
            to="/dashboard"
            className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
              isActive('/dashboard') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[9px] font-semibold uppercase tracking-wider">HQ</span>
          </Link>

          <button
            onClick={() => openBottomTab('studio')}
            className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
              activeBottomTab === 'studio' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sparkles className="w-5 h-5" />
            <span className="text-[9px] font-semibold uppercase tracking-wider">Studio</span>
          </button>

          <button
            onClick={() => openBottomTab('settings')}
            className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
              activeBottomTab === 'settings' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <SettingsIcon className="w-5 h-5" />
            <span className="text-[9px] font-semibold uppercase tracking-wider">Account</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
