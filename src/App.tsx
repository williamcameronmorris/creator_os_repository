import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { Auth } from './components/Auth';
import { Onboarding } from './components/Onboarding';
import { Layout } from './components/Layout';
import { DailyPulse } from './components/DailyPulse';
import { Schedule } from './pages/Schedule';
import { Media } from './pages/Media';
import { Analytics } from './pages/Analytics';
import { SavedIdeasPage } from './pages/SavedIdeasPage';
import { Profile } from './pages/Profile';
import { SettingsPage } from './pages/SettingsPage';
import { Studio } from './pages/Studio';
import { PostComposerPage } from './pages/PostComposerPage';
import { MetaCallback } from './components/MetaCallback';
import { ThreadsCallback } from './components/ThreadsCallback';
import { YoutubeCallback } from './components/YoutubeCallback';
import { supabase, type Profile as ProfileType } from './lib/supabase';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f5ff]">
        <div className="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
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

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (data) {
      setProfile(data);
    }
    setCheckingProfile(false);
  };

  if (loading || checkingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f5ff]">
        <div className="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
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

  if (profile && !profile.onboarding_completed) {
    return (
      <Routes>
        <Route path="/onboarding" element={<Onboarding onComplete={loadProfile} />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout><DailyPulse /></Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout><DailyPulse /></Layout>
          </ProtectedRoute>
        }
      />
      <Route path="/command-center" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/studio"
        element={
          <ProtectedRoute>
            <Layout><Studio /></Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/schedule"
        element={
          <ProtectedRoute>
            <Layout><Schedule /></Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/schedule/new"
        element={
          <ProtectedRoute>
            <Layout><PostComposerPage /></Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/schedule/edit/:id"
        element={
          <ProtectedRoute>
            <Layout><PostComposerPage /></Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/media"
        element={
          <ProtectedRoute>
            <Layout><Media /></Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <ProtectedRoute>
            <Layout><Analytics /></Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/saved-ideas"
        element={
          <ProtectedRoute>
            <Layout><SavedIdeasPage /></Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Layout><Profile /></Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Layout><SettingsPage /></Layout>
          </ProtectedRoute>
        }
      />

      {/* ── OAuth Callbacks ── */}
      <Route
        path="/auth/meta/callback"
        element={
          <ProtectedRoute>
            <MetaCallback />
          </ProtectedRoute>
        }
      />
      <Route
        path="/auth/threads/callback"
        element={
          <ProtectedRoute>
            <ThreadsCallback />
          </ProtectedRoute>
        }
      />
      <Route
        path="/auth/youtube/callback"
        element={
          <ProtectedRoute>
            <YoutubeCallback />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <SubscriptionProvider>
            <AppContent />
          </SubscriptionProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
