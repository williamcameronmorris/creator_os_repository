import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { Auth } from './components/Auth';
import { Onboarding } from './components/Onboarding';
import { Layout } from './components/Layout';
import { RoleSelection } from './pages/RoleSelection';
import { SocialDashboard } from './pages/SocialDashboard';
import { Pipeline } from './pages/Pipeline';
import { Schedule } from './pages/Schedule';
import { Media } from './pages/Media';
import { Analytics } from './pages/Analytics';
import { Revenue } from './pages/Revenue';
import { QuickQuotePage } from './pages/QuickQuotePage';
import { TemplatesPage } from './pages/TemplatesPage';
import { CopyBankPage } from './pages/CopyBankPage';
import { Profile } from './pages/Profile';
import { SettingsPage } from './pages/SettingsPage';
import { supabase, type Profile as ProfileType } from './lib/supabase';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-white">Loading...</div>
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
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-white">Loading...</div>
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

  if (profile && !profile.role) {
    return (
      <Routes>
        <Route path="/role-selection" element={<RoleSelection />} />
        <Route path="*" element={<Navigate to="/role-selection" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              <SocialDashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout>
              <SocialDashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/pipeline"
        element={
          <ProtectedRoute>
            <Layout>
              <Pipeline />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/schedule"
        element={
          <ProtectedRoute>
            <Layout>
              <Schedule />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/media"
        element={
          <ProtectedRoute>
            <Layout>
              <Media />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <ProtectedRoute>
            <Layout>
              <Analytics />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/revenue"
        element={
          <ProtectedRoute>
            <Layout>
              <Revenue />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/quick-quote"
        element={
          <ProtectedRoute>
            <Layout>
              <QuickQuotePage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/templates"
        element={
          <ProtectedRoute>
            <Layout>
              <TemplatesPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/copy-bank"
        element={
          <ProtectedRoute>
            <Layout>
              <CopyBankPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Layout>
              <Profile />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Layout>
              <SettingsPage />
            </Layout>
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
