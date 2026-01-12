import { ReactNode, useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  Home,
  LayoutGrid,
  Copy,
  Settings as SettingsIcon,
  LogOut,
  Calculator,
  FileText,
  Briefcase,
  Calendar,
  Image,
  TrendingUp,
  DollarSign,
  User,
  Moon,
  Sun,
  ChevronDown,
  ChevronRight,
  X,
  Sparkles
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

type BottomNavTab = 'content' | 'deals' | 'settings' | null;

export function Layout({ children }: LayoutProps) {
  const { user, signOut } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeBottomTab, setActiveBottomTab] = useState<BottomNavTab>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    headquarters: true,
    studio: true,
    office: true,
    system: true,
  });

  // Swipe gesture state
  const [swipeProgress, setSwipeProgress] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isSwipingBack = useRef(false);

  const navigationSections: NavSection[] = [
    {
      title: 'HEADQUARTERS',
      items: [
        { path: '/dashboard', label: 'Command Center', icon: Home },
      ],
    },
    {
      title: 'THE STUDIO',
      items: [
        { path: '/schedule', label: 'Content Schedule', icon: Calendar },
        { path: '/media', label: 'Media Library', icon: Image },
        { path: '/analytics', label: 'Audience Growth', icon: TrendingUp },
      ],
    },
    {
      title: 'THE OFFICE',
      items: [
        { path: '/pipeline', label: 'Deal Pipeline', icon: LayoutGrid },
        { path: '/revenue', label: 'Finances', icon: DollarSign },
        { path: '/quick-quote', label: 'Quick Quote', icon: Calculator },
        { path: '/templates', label: 'Templates', icon: FileText },
        { path: '/copy-bank', label: 'Copy Bank', icon: Copy },
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

  const toggleSection = (sectionKey: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const closeBottomNav = () => {
    setActiveBottomTab(null);
  };

  const openBottomTab = (tab: BottomNavTab) => {
    setActiveBottomTab(activeBottomTab === tab ? null : tab);
  };

  // Check if we can navigate back
  const canGoBack = () => {
    const homePaths = ['/', '/dashboard'];
    return !homePaths.includes(location.pathname);
  };

  // Swipe gesture handlers
  const handleTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;

    // Only trigger swipe if starting from left edge (within 50px)
    if (touch.clientX <= 50 && canGoBack()) {
      isSwipingBack.current = true;
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isSwipingBack.current || touchStartX.current === null || touchStartY.current === null) {
      return;
    }

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = touch.clientY - touchStartY.current;

    // Cancel swipe if moving more vertically than horizontally
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      isSwipingBack.current = false;
      setSwipeProgress(0);
      return;
    }

    // Update swipe progress (max 300px for full swipe)
    if (deltaX > 0) {
      const progress = Math.min(deltaX / 300, 1);
      setSwipeProgress(progress);

      // Prevent default scrolling when swiping
      if (deltaX > 10) {
        e.preventDefault();
      }
    }
  };

  const handleTouchEnd = () => {
    if (!isSwipingBack.current) {
      return;
    }

    // Navigate back if swipe progress is more than 40%
    if (swipeProgress > 0.4) {
      navigate(-1);
    }

    // Reset state
    isSwipingBack.current = false;
    setSwipeProgress(0);
    touchStartX.current = null;
    touchStartY.current = null;
  };

  // Attach touch event listeners
  useEffect(() => {
    const handleStart = (e: TouchEvent) => handleTouchStart(e);
    const handleMove = (e: TouchEvent) => handleTouchMove(e);
    const handleEnd = () => handleTouchEnd();

    document.addEventListener('touchstart', handleStart, { passive: false });
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleEnd);

    return () => {
      document.removeEventListener('touchstart', handleStart);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [location.pathname, swipeProgress]);

  const renderNavigation = (isMobile: boolean = false) => (
    <div className="space-y-6">
      {navigationSections.map((section, sectionIndex) => {
        const sectionKey = section.title.toLowerCase().replace(/\s+/g, '-');
        const isExpanded = expandedSections[sectionKey];

        return (
          <div key={sectionIndex}>
            <button
              onClick={() => toggleSection(sectionKey)}
              className="w-full flex items-center justify-between mb-2 px-2 py-1 text-xs font-bold tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              {section.title}
              {isExpanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>

            {isExpanded && (
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={isMobile ? closeBottomNav : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm font-medium ${
                        active
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}

            {sectionIndex < navigationSections.length - 1 && (
              <div className="mt-4 border-t border-border" />
            )}
          </div>
        );
      })}
    </div>
  );

  const renderBottomNavContent = () => {
    if (!activeBottomTab) return null;

    let content;
    let title = '';

    if (activeBottomTab === 'content') {
      title = 'The Studio';
      content = navigationSections[1];
    } else if (activeBottomTab === 'deals') {
      title = 'The Office';
      content = navigationSections[2];
    } else if (activeBottomTab === 'settings') {
      title = 'Settings';
      content = navigationSections[3];
    }

    return (
      <>
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={closeBottomNav}
        />
        <div className="fixed bottom-16 left-0 right-0 bg-card border-t border-border z-50 lg:hidden max-h-[60vh] overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground">{title}</h3>
              <button
                onClick={closeBottomNav}
                className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {activeBottomTab === 'settings' ? (
              <div className="space-y-2">
                {content?.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={closeBottomNav}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm font-medium ${
                        active
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
                <div className="border-t border-border my-2" />
                <button
                  onClick={toggleDarkMode}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  {darkMode ? <Sun className="w-4 h-4 flex-shrink-0" /> : <Moon className="w-4 h-4 flex-shrink-0" />}
                  <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
                </button>
                <button
                  onClick={() => {
                    signOut();
                    closeBottomNav();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <LogOut className="w-4 h-4 flex-shrink-0" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {content?.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={closeBottomNav}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm font-medium ${
                        active
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-16 lg:pb-0">
      {/* Swipe back indicator */}
      {swipeProgress > 0 && (
        <>
          <div
            className="fixed inset-0 bg-black z-[60] pointer-events-none transition-opacity duration-150"
            style={{ opacity: swipeProgress * 0.3 }}
          />
          <div
            className="fixed left-0 top-0 bottom-0 w-1 bg-primary z-[61] pointer-events-none transition-all duration-150"
            style={{
              transform: `translateX(${swipeProgress * 50}px)`,
              opacity: swipeProgress,
            }}
          />
          <div
            className="fixed left-4 top-1/2 -translate-y-1/2 z-[61] pointer-events-none transition-all duration-150"
            style={{
              transform: `translateX(${swipeProgress * 60 - 40}px) translateY(-50%)`,
              opacity: swipeProgress,
            }}
          >
            <ChevronRight className="w-8 h-8 text-primary rotate-180" />
          </div>
        </>
      )}

      <nav className="bg-card border-b border-border sticky top-0 z-50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary">
                <Briefcase className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  Creator OS
                </h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Studio + Office
                </p>
              </div>
            </div>

            <div className="hidden lg:flex items-center gap-3">
              <button
                onClick={toggleDarkMode}
                className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title={darkMode ? 'Light mode' : 'Dark mode'}
              >
                {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <span className="text-sm text-muted-foreground hidden md:block truncate max-w-[150px] lg:max-w-none">
                {user?.email}
              </span>
              <button
                onClick={() => signOut()}
                className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="Sign out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {renderBottomNavContent()}

      <div className="flex">
        <aside className="w-64 bg-card border-r border-border min-h-[calc(100vh-4rem)] hidden lg:block">
          <div className="p-4">
            {renderNavigation()}
          </div>
        </aside>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0">
          {children}
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 lg:hidden">
        <div className="flex items-center justify-around h-16">
          <Link
            to="/dashboard"
            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
              isActive('/dashboard')
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Home className="w-5 h-5 mb-1" />
            <span className="text-xs font-medium">HQ</span>
          </Link>
          <button
            onClick={() => openBottomTab('content')}
            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
              activeBottomTab === 'content'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sparkles className="w-5 h-5 mb-1" />
            <span className="text-xs font-medium">Content</span>
          </button>
          <button
            onClick={() => openBottomTab('deals')}
            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
              activeBottomTab === 'deals'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Briefcase className="w-5 h-5 mb-1" />
            <span className="text-xs font-medium">Deals</span>
          </button>
          <button
            onClick={() => openBottomTab('settings')}
            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
              activeBottomTab === 'settings'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <SettingsIcon className="w-5 h-5 mb-1" />
            <span className="text-xs font-medium">Settings</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
