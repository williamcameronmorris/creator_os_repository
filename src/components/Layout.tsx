import { ReactNode, useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { TokenHealthBanner } from './TokenHealthBanner';
import {
  Home,
  Settings as SettingsIcon,
  LogOut,
  Calendar,
  Image,
  TrendingUp,
  User,
  ChevronRight,
  X,
  Sparkles,
  Bookmark,
  Video,
  MessageCircle,
  Repeat2,
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
  description?: string;
  icon: any;
}

type BottomNavTab = 'studio' | 'settings' | null;

export function Layout({ children }: LayoutProps) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeBottomTab, setActiveBottomTab] = useState<BottomNavTab>(null);

  // Swipe back gesture state
  const [swipeProgress, setSwipeProgress] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isSwipingBack = useRef(false);

  const navigationSections: NavSection[] = [
    {
      title: 'HEADQUARTERS',
      items: [
        { path: '/dashboard', label: 'Daily Pulse', icon: Home },
      ],
    },
    {
      title: 'THE STUDIO',
      items: [
        { path: '/studio', label: 'Content Workflow', icon: Video },
        { path: '/schedule', label: 'Content Schedule', icon: Calendar },
        { path: '/saved-ideas', label: 'Saved Ideas', icon: Bookmark },
        { path: '/media', label: 'Media Library', icon: Image },
        { path: '/analytics', label: 'Audience Growth', icon: TrendingUp },
        { path: '/inbox', label: 'Comment Inbox', icon: MessageCircle },
        { path: '/repurpose', label: 'Repurpose Content', icon: Repeat2 },
      ],
    },
    {
      title: 'SYSTEM',
      items: [
        { path: '/profile', label: 'Profile', icon: User },
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

  // Swipe-back gesture
  const handleTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    if (touch.clientX <= 50 && canGoBack()) {
      isSwipingBack.current = true;
    }
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
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium ${
            active
              ? 'bg-violet-100 text-violet-700'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
          }`}
        >
          <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-violet-600' : ''}`} />
          <div className="flex-1 min-w-0">
            <div>{item.label}</div>
            {item.description && (
              <div className="text-xs font-normal opacity-60 truncate">{item.description}</div>
            )}
          </div>
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
    const title = activeBottomTab === 'studio' ? 'The Studio' : 'Settings';

    return (
      <>
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={closeBottomNav} />
        <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-gray-100 z-50 lg:hidden max-h-[65vh] overflow-y-auto rounded-t-3xl shadow-xl">
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-gray-900">{title}</h3>
              <button
                onClick={closeBottomNav}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-1">
              {renderNavLinks(section, closeBottomNav)}
              {activeBottomTab === 'settings' && (
                <>
                  <div className="border-t border-gray-100 my-3" />
                  <button
                    onClick={() => { signOut(); closeBottomNav(); }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl w-full text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-all"
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
    <div className="min-h-screen bg-[#f7f5ff] pb-16 lg:pb-0">
      {/* Swipe-back indicator */}
      {swipeProgress > 0 && (
        <>
          <div
            className="fixed inset-0 bg-black z-[60] pointer-events-none"
            style={{ opacity: swipeProgress * 0.2 }}
          />
          <div
            className="fixed left-4 top-1/2 z-[61] pointer-events-none"
            style={{
              transform: `translateX(${swipeProgress * 60 - 40}px) translateY(-50%)`,
              opacity: swipeProgress,
            }}
          >
            <ChevronRight className="w-8 h-8 text-violet-600 rotate-180" />
          </div>
        </>
      )}

      {/* ── Top header ─────────────────────────────────── */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/dashboard" className="flex items-center gap-2.5 select-none">
              <div className="w-2.5 h-2.5 rounded-full bg-violet-600" />
              <span className="text-lg font-black tracking-tight text-gray-900">
                Creator Command
              </span>
            </Link>

            {/* Desktop right side */}
            <div className="hidden lg:flex items-center gap-3">
              <span className="text-sm text-gray-400 truncate max-w-[180px]">
                {user?.email}
              </span>
              <button
                onClick={() => signOut()}
                className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
              <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white text-sm font-bold select-none">
                {userInitial}
              </div>
            </div>

            {/* Mobile avatar */}
            <div className="lg:hidden">
              <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white text-sm font-bold select-none">
                {userInitial}
              </div>
            </div>
          </div>
        </div>
      </header>

      {renderBottomNavContent()}

      <div className="flex overflow-x-hidden">
        {/* ── Desktop sidebar ─────────────────────────── */}
        <aside className="w-60 bg-white border-r border-gray-100 min-h-[calc(100vh-4rem)] hidden lg:block flex-shrink-0">
          <nav className="p-4 space-y-6">
            {navigationSections.map((section) => (
              <div key={section.title}>
                <p className="text-[10px] font-black tracking-widest text-gray-400 uppercase px-3 mb-2">
                  {section.title}
                </p>
                <div className="space-y-0.5">
                  {renderNavLinks(section)}
                </div>
              </div>
            ))}

            <div className="border-t border-gray-100 pt-4">
              <button
                onClick={() => signOut()}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl w-full text-sm font-medium text-gray-400 hover:bg-gray-100 hover:text-gray-900 transition-all"
              >
                <LogOut className="w-4 h-4 flex-shrink-0" />
                Sign Out
              </button>
            </div>
          </nav>
        </aside>

        {/* ── Main content ─────────────────────────────── */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0 overflow-x-hidden">
          <TokenHealthBanner />
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav ────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50 lg:hidden">
        <div className="flex items-center justify-around h-16">
          <Link
            to="/dashboard"
            className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
              isActive('/dashboard') ? 'text-violet-600' : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] font-bold">HQ</span>
          </Link>

          <button
            onClick={() => openBottomTab('studio')}
            className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
              activeBottomTab === 'studio' ? 'text-violet-600' : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            <Sparkles className="w-5 h-5" />
            <span className="text-[10px] font-bold">Studio</span>
          </button>

          <button
            onClick={() => openBottomTab('settings')}
            className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
              activeBottomTab === 'settings' ? 'text-violet-600' : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            <SettingsIcon className="w-5 h-5" />
            <span className="text-[10px] font-bold">Settings</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
