import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { User, Briefcase, ArrowRight } from 'lucide-react';

export function RoleSelection() {
  const { user } = useAuth();
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<'creator' | 'brand' | null>(null);
  const [loading, setLoading] = useState(false);

  const handleContinue = async () => {
    if (!selectedRole || !user) return;

    setLoading(true);
    const { error } = await supabase
      .from('profiles')
      .update({ role: selectedRole, onboarding_completed: true })
      .eq('id', user.id);

    if (!error) {
      navigate('/dashboard');
    }
    setLoading(false);
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-slate-900' : 'bg-slate-50'} flex items-center justify-center p-4`}>
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <h1 className={`text-4xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Welcome to Brand Deal OS
          </h1>
          <p className={`text-xl ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Choose your role to get started
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <button
            onClick={() => setSelectedRole('creator')}
            className={`p-8 rounded-2xl text-left transition-all ${
              selectedRole === 'creator'
                ? 'ring-2 ring-sky-500 bg-sky-500/10'
                : darkMode
                ? 'bg-slate-800 border border-slate-700 hover:border-slate-600'
                : 'bg-white border border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-sky-500/10 mb-6">
              <User className="w-8 h-8 text-sky-500" />
            </div>
            <h2 className={`text-2xl font-bold mb-3 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Creator
            </h2>
            <p className={`${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Manage your content, track deals, schedule posts, and grow your brand partnerships
            </p>
          </button>

          <button
            onClick={() => setSelectedRole('brand')}
            className={`p-8 rounded-2xl text-left transition-all ${
              selectedRole === 'brand'
                ? 'ring-2 ring-orange-500 bg-orange-500/10'
                : darkMode
                ? 'bg-slate-800 border border-slate-700 hover:border-slate-600'
                : 'bg-white border border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500/10 mb-6">
              <Briefcase className="w-8 h-8 text-orange-500" />
            </div>
            <h2 className={`text-2xl font-bold mb-3 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Brand
            </h2>
            <p className={`${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Discover creators, manage campaigns, track partnerships, and measure ROI
            </p>
          </button>
        </div>

        <div className="text-center">
          <button
            onClick={handleContinue}
            disabled={!selectedRole || loading}
            className={`px-8 py-4 rounded-xl font-semibold inline-flex items-center gap-2 transition-all ${
              selectedRole
                ? 'bg-gradient-to-r from-sky-500 to-sky-600 text-white hover:shadow-lg'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed'
            }`}
          >
            {loading ? 'Setting up...' : 'Continue'}
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
