import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { User, Instagram, Youtube } from 'lucide-react';

interface ProfileData {
  full_name: string;
  bio: string;
  instagram_handle: string;
  instagram_followers: number;
  youtube_handle: string;
  youtube_followers: number;
  tiktok_handle: string;
  tiktok_followers: number;
}

export function Profile() {
  const { user } = useAuth();
  const { darkMode } = useTheme();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (!error && data) {
      setProfile(data);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'} mb-2`}>
          Profile
        </h1>
        <p className={`${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Manage your profile and social accounts
        </p>
      </div>

      {loading ? (
        <div className={`p-8 rounded-xl text-center ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
          <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Loading...</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className={`p-6 rounded-xl ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}>
            <div className="flex items-center gap-4 mb-6">
              <div className="flex items-center justify-center w-20 h-20 rounded-full bg-sky-500/10">
                <User className="w-10 h-10 text-sky-500" />
              </div>
              <div>
                <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {profile?.full_name || 'Add your name'}
                </h2>
                <p className={`${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  {user?.email}
                </p>
              </div>
            </div>

            {profile?.bio && (
              <p className={`${darkMode ? 'text-slate-300' : 'text-slate-700'} mb-4`}>
                {profile.bio}
              </p>
            )}
          </div>

          <div className={`p-6 rounded-xl ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}>
            <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Connected Accounts
            </h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-pink-500/10">
                    <Instagram className="w-5 h-5 text-pink-500" />
                  </div>
                  <div>
                    <p className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      {profile?.instagram_handle || 'Not connected'}
                    </p>
                    {profile?.instagram_followers ? (
                      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        {profile.instagram_followers.toLocaleString()} followers
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-500/10">
                    <Youtube className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <p className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      {profile?.youtube_handle || 'Not connected'}
                    </p>
                    {profile?.youtube_followers ? (
                      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        {profile.youtube_followers.toLocaleString()} followers
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
