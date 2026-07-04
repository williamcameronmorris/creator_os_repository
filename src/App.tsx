import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { ConnectionStatusProvider } from './contexts/ConnectionStatusContext';
import { Auth } from './components/Auth';
import { Onboarding } from './components/Onboarding';
import { Layout } from './components/Layout';
import { Clio } from './pages/Clio';
import { StudioHub } from './pages/StudioHub';
import { Studio } from './pages/Studio';
import { OfficeHub } from './pages/OfficeHub';
import { Schedule } from './pages/Schedule';
import { Media } from './pages/Media';
import { Analytics } from './pages/Analytics';
import { AnalyticsPlatform } from './pages/AnalyticsPlatform';
import { SavedIdeasPage } from './pages/SavedIdeasPage';
import { Profile } from './pages/Profile';
import { SettingsPage } from './pages/SettingsPage';
import { PostComposerPage } from './pages/PostComposerPage';
import { ComposePost } from './pages/ComposePost';
import { Watch } from './pages/Watch';
import { WatchCreator } from './pages/WatchCreator';
import { StudioChallenge } from './pages/StudioChallenge';
import { Templates } from './pages/Templates';
import { MetaCallback } from './components/MetaCallback';
import { ThreadsCallback } from './components/ThreadsCallback';
import { YoutubeCallback } from './components/YoutubeCallback';
import { PostForMeCallback } from './components/PostForMeCallback';
import { Connections } from './pages/Connections';
import { ErrorBoundary } from './components/ErrorBoundary';
import { supabase, type Profile as ProfileType } from './lib/supabase';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-1.5 h-1.5 bg-foreground animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

function AppContent() {
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<ProfileType | null>(null);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (user) {
      loadProfile();
    } else {
      setCheckingProfile(false);
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    setLoadError(false);
    setCheckingProfile(true);
    // Safety net for a hung request: treat a stall as an error (retry screen),
    // never as "no profile" — a null profile used to fall THROUGH into the app,
    // dropping the user in un-onboarded with no niche.
    const safetyTimer = setTimeout(() => {
      setLoadError(true);
      setCheckingProfile(false);
    }, 8000);
    try {
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();
          if (error) throw error;
          setProfile(data ?? null); // null = row not created yet (new user → onboarding)
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (lastErr) setLoadError(true);
    } finally {
      clearTimeout(safetyTimer);
      setCheckingProfile(false);
    }
  };

  // OAuth callbacks must render regardless of auth/loading state. They wait for
  // the session themselves; if we let the auth gate run first, a callback that
  // arrives before the session finishes restoring gets redirected to /auth and
  // the one-time ?code is lost, forcing the user to restart the connect flow.
  if (
    location.pathname.startsWith('/auth/') &&
    location.pathname.endsWith('/callback')
  ) {
    return (
      <Routes>
        <Route path="/auth/meta/callback" element={<MetaCallback />} />
        <Route path="/auth/threads/callback" element={<ThreadsCallback />} />
        <Route path="/auth/youtube/callback" element={<YoutubeCallback />} />
        <Route path="/auth/postforme/callback" element={<PostForMeCallback />} />
      </Routes>
    );
  }

  if (loading || checkingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-1.5 h-1.5 bg-foreground animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    );
  }

  // Profile couldn't be loaded (network/transient). Show a retry rather than
  // silently dropping the user into the app un-onboarded.
  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center gap-4">
        <p className="text-sm text-foreground">We couldn't load your profile.</p>
        <p className="text-xs text-muted-foreground">Check your connection and try again.</p>
        <button onClick={loadProfile} className="btn-ie btn-ie-solid px-4 py-2">
          <span className="btn-ie-text">Retry</span>
        </button>
      </div>
    );
  }

  // First-time onboarding flow: name+niche → connect → walkthrough → done.
  // Driven by profiles.onboarding_step. Fail CLOSED: a missing/null profile
  // (new user, or a row that couldn't be read) also routes to onboarding
  // rather than falling through into the app un-onboarded.
  if (!profile || profile.onboarding_step !== 'done') {
    return (
      <Routes>
        <Route path="/onboarding" element={<Onboarding onComplete={loadProfile} />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* Ã¢ÂÂÃ¢ÂÂ Clio (landing) Ã¢ÂÂÃ¢ÂÂ */}
      <Route path="/" element={<ProtectedRoute><Layout><Clio /></Layout></ProtectedRoute>} />
      <Route path="/clio" element={<Navigate to="/" replace />} />

      {/* Ã¢ÂÂÃ¢ÂÂ Legacy redirects Ã¢ÂÂÃ¢ÂÂ */}
      <Route path="/dashboard" element={<Navigate to="/" replace />} />
      <Route path="/command-center" element={<Navigate to="/" replace />} />

      {/* Ã¢ÂÂÃ¢ÂÂ Studio Ã¢ÂÂÃ¢ÂÂ */}
      <Route path="/studio" element={<ProtectedRoute><Layout><StudioHub /></Layout></ProtectedRoute>} />
      <Route path="/studio/workflow" element={<ProtectedRoute><Layout><Studio /></Layout></ProtectedRoute>} />
      <Route path="/studio/script" element={<ProtectedRoute><Layout><Studio /></Layout></ProtectedRoute>} />
      <Route path="/studio/script/:id" element={<ProtectedRoute><Layout><Studio /></Layout></ProtectedRoute>} />
      <Route path="/studio/templates" element={<ProtectedRoute><Layout><Templates /></Layout></ProtectedRoute>} />
      <Route path="/studio/challenge" element={<ProtectedRoute><Layout><StudioChallenge /></Layout></ProtectedRoute>} />
      <Route path="/media" element={<ProtectedRoute><Layout><Media /></Layout></ProtectedRoute>} />
      <Route path="/saved-ideas" element={<ProtectedRoute><Layout><SavedIdeasPage /></Layout></ProtectedRoute>} />

      {/* Ã¢ÂÂÃ¢ÂÂ Office Ã¢ÂÂÃ¢ÂÂ */}
      <Route path="/watch" element={<ProtectedRoute><Layout><Watch /></Layout></ProtectedRoute>} />
      <Route path="/watch/creator/:id" element={<ProtectedRoute><Layout><WatchCreator /></Layout></ProtectedRoute>} />
      <Route path="/office" element={<ProtectedRoute><Layout><OfficeHub /></Layout></ProtectedRoute>} />
      <Route path="/office/connections" element={<ProtectedRoute><Layout><Connections /></Layout></ProtectedRoute>} />
      <Route path="/schedule" element={<ProtectedRoute><Layout><Schedule /></Layout></ProtectedRoute>} />
      <Route path="/schedule/new" element={<ProtectedRoute><Layout><PostComposerPage /></Layout></ProtectedRoute>} />
      <Route path="/schedule/edit/:id" element={<ProtectedRoute><Layout><PostComposerPage /></Layout></ProtectedRoute>} />
      <Route path="/compose" element={<ProtectedRoute><Layout><ComposePost /></Layout></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><Layout><Analytics /></Layout></ProtectedRoute>} />
      <Route path="/analytics/youtube" element={<ProtectedRoute><Layout><AnalyticsPlatform platform="youtube" /></Layout></ProtectedRoute>} />
      <Route path="/analytics/instagram" element={<ProtectedRoute><Layout><AnalyticsPlatform platform="instagram" /></Layout></ProtectedRoute>} />
      <Route path="/analytics/tiktok" element={<ProtectedRoute><Layout><AnalyticsPlatform platform="tiktok" /></Layout></ProtectedRoute>} />
      <Route path="/revenue" element={<ProtectedRoute><Layout><Schedule /></Layout></ProtectedRoute>} />
      <Route path="/pipeline" element={<ProtectedRoute><Layout><Schedule /></Layout></ProtectedRoute>} />

      {/* Ã¢ÂÂÃ¢ÂÂ Settings Ã¢ÂÂÃ¢ÂÂ */}
      <Route path="/profile" element={<ProtectedRoute><Layout><Profile /></Layout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Layout><SettingsPage /></Layout></ProtectedRoute>} />

      {/* Ã¢ÂÂÃ¢ÂÂ OAuth Callbacks Ã¢ÂÂÃ¢ÂÂ */}
      {/* OAuth callbacks are rendered above the auth gate (see AppContent top). */}

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <ConnectionStatusProvider>
              <SubscriptionProvider>
                <AppContent />
              </SubscriptionProvider>
            </ConnectionStatusProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
