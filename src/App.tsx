import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import { SavedIdeasPage } from './pages/SavedIdeasPage';
import { Profile } from './pages/Profile';
import { SettingsPage } from './pages/SettingsPage';
import { PostComposerPage } from './pages/PostComposerPage';
import { ComposePost } from './pages/ComposePost';
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

  useEffect(() => {
    if (user) {
      loadProfile();
    } else {
      setCheckingProfile(false);
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    const safetyTimer = setTimeout(() => setCheckingProfile(false), 8000);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (data) {
        setProfile(data);
      }
    } catch {
      // profile load failure is non-critical
    } finally {
      clearTimeout(safetyTimer);
      setCheckingProfile(false);
    }
  };

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

  // First-time onboarding flow: name+niche → connect → walkthrough → done.
  // Driven by profiles.onboarding_step. Anything other than 'done' routes
  // the user into Onboarding regardless of which page they tried to load.
  if (profile && profile.onboarding_step !== 'done') {
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
      <Route path="/office" element={<ProtectedRoute><Layout><OfficeHub /></Layout></ProtectedRoute>} />
      <Route path="/office/connections" element={<ProtectedRoute><Layout><Connections /></Layout></ProtectedRoute>} />
      <Route path="/schedule" element={<ProtectedRoute><Layout><Schedule /></Layout></ProtectedRoute>} />
      <Route path="/schedule/new" element={<ProtectedRoute><Layout><PostComposerPage /></Layout></ProtectedRoute>} />
      <Route path="/schedule/edit/:id" element={<ProtectedRoute><Layout><PostComposerPage /></Layout></ProtectedRoute>} />
      <Route path="/compose" element={<ProtectedRoute><Layout><ComposePost /></Layout></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><Layout><Analytics /></Layout></ProtectedRoute>} />
      <Route path="/revenue" element={<ProtectedRoute><Layout><Schedule /></Layout></ProtectedRoute>} />
      <Route path="/pipeline" element={<ProtectedRoute><Layout><Schedule /></Layout></ProtectedRoute>} />

      {/* Ã¢ÂÂÃ¢ÂÂ Settings Ã¢ÂÂÃ¢ÂÂ */}
      <Route path="/profile" element={<ProtectedRoute><Layout><Profile /></Layout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Layout><SettingsPage /></Layout></ProtectedRoute>} />

      {/* Ã¢ÂÂÃ¢ÂÂ OAuth Callbacks Ã¢ÂÂÃ¢ÂÂ */}
      <Route path="/auth/meta/callback" element={<ProtectedRoute><MetaCallback /></ProtectedRoute>} />
      <Route path="/auth/threads/callback" element={<ProtectedRoute><ThreadsCallback /></ProtectedRoute>} />
      <Route path="/auth/youtube/callback" element={<ProtectedRoute><YoutubeCallback /></ProtectedRoute>} />
      <Route path="/auth/postforme/callback" element={<ProtectedRoute><PostForMeCallback /></ProtectedRoute>} />

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
