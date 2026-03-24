import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  User, Instagram, Youtube, Video, Edit2, Save, X,
  Phone, MapPin, Globe, Mail, AtSign, CheckCircle, Clock,
} from 'lucide-react';
import { COMMON_TIMEZONES, detectBrowserTimezone } from '../lib/timezone';
import { ThreadsIcon } from '../components/icons/ThreadsIcon';

interface ProfileData {
  full_name: string;
  display_name: string;
  bio: string;
  phone: string;
  city: string;
  state: string;
  website: string;
  instagram_handle: string;
  instagram_followers: number;
  youtube_handle: string;
  youtube_followers: number;
  tiktok_handle: string;
  tiktok_followers: number;
  threads_handle: string;
  threads_followers: number;
  instagram_access_token: string | null;
  youtube_access_token: string | null;
  tiktok_access_token: string | null;
  threads_access_token: string | null;
  timezone: string;
}

const emptyProfile: ProfileData = {
  full_name: '',
  display_name: '',
  bio: '',
  phone: '',
  city: '',
  state: '',
  website: '',
  instagram_handle: '',
  instagram_followers: 0,
  youtube_handle: '',
  youtube_followers: 0,
  tiktok_handle: '',
  tiktok_followers: 0,
  threads_handle: '',
  threads_followers: 0,
  instagram_access_token: null,
  youtube_access_token: null,
  tiktok_access_token: null,
  threads_access_token: null,
  timezone: 'America/New_York',
};

export function Profile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<ProfileData>>({});
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (user) loadProfile();
    else setLoading(false);
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (!error && data) setProfile({ ...emptyProfile, ...data });
    setLoading(false);
  };

  const startEditing = () => {
    setEditForm({
      full_name: profile.full_name,
      display_name: profile.display_name,
      bio: profile.bio,
      phone: profile.phone,
      city: profile.city,
      state: profile.state,
      website: profile.website,
      timezone: profile.timezone || detectBrowserTimezone(),
    });
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditForm({});
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update(editForm)
      .eq('id', user.id);
    if (!error) {
      setProfile((prev) => ({ ...prev, ...editForm }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      setEditing(false);
    }
    setSaving(false);
  };

  const Field = ({
    label,
    icon: Icon,
    field,
    placeholder,
    type = 'text',
  }: {
    label: string;
    icon: React.ElementType;
    field: keyof ProfileData;
    placeholder: string;
    type?: string;
  }) => (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      {editing ? (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-violet-200 bg-violet-50 focus-within:border-violet-400 transition-colors">
          <Icon className="w-4 h-4 text-violet-400 flex-shrink-0" />
          <input
            type={type}
            value={(editForm[field] as string) ?? ''}
            onChange={(e) => setEditForm((f) => ({ ...f, [field]: e.target.value }))}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none"
          />
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50">
          <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className={`text-sm ${profile[field] ? 'text-slate-800' : 'text-slate-400'}`}>
            {(profile[field] as string) || placeholder}
          </span>
        </div>
      )}
    </div>
  );

  const platforms = [
    {
      key: 'instagram',
      label: 'Instagram',
      Icon: Instagram,
      iconClass: 'text-pink-500',
      bg: 'bg-pink-50',
      handle: profile.instagram_handle,
      followers: profile.instagram_followers,
      connected: !!profile.instagram_access_token,
    },
    {
      key: 'youtube',
      label: 'YouTube',
      Icon: Youtube,
      iconClass: 'text-red-500',
      bg: 'bg-red-50',
      handle: profile.youtube_handle,
      followers: profile.youtube_followers,
      connected: !!profile.youtube_access_token,
    },
    {
      key: 'threads',
      label: 'Threads',
      Icon: ThreadsIcon,
      iconClass: 'text-gray-800',
      bg: 'bg-gray-100',
      handle: profile.threads_handle,
      followers: profile.threads_followers,
      connected: !!profile.threads_access_token,
    },
    {
      key: 'tiktok',
      label: 'TikTok',
      Icon: Video,
      iconClass: 'text-gray-700',
      bg: 'bg-gray-100',
      handle: profile.tiktok_handle,
      followers: profile.tiktok_followers,
      connected: !!profile.tiktok_access_token,
    },
  ];

  const displayName = profile.display_name || profile.full_name || user?.email?.split('@')[0] || 'Your Name';

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="p-8 rounded-2xl bg-white border border-slate-100 text-center">
          <p className="text-slate-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Safari safety valve: force loading=false after 5s if fetch hangs
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 5000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Profile</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage your account information</p>
        </div>
        {!editing ? (
          <button
            onClick={startEditing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
            Edit Profile
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={cancelEditing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-semibold transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
            <button
              onClick={saveProfile}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
            >
              {saveSuccess ? (
                <><CheckCircle className="w-3.5 h-3.5" /> Saved!</>
              ) : (
                <><Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save'}</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Identity card */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center flex-shrink-0">
            <User className="w-8 h-8 text-violet-500" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900">{displayName}</h2>
            <p className="text-sm text-slate-400">{user?.email}</p>
            {(profile.city || profile.state) && (
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {[profile.city, profile.state].filter(Boolean).join(', ')}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full Name" icon={User} field="full_name" placeholder="Your full name" />
          <Field label="Display Name" icon={AtSign} field="display_name" placeholder="How you appear in the app" />
          <Field label="Email" icon={Mail} field="full_name" placeholder={user?.email || ''} />
          <Field label="Phone" icon={Phone} field="phone" placeholder="+1 (555) 000-0000" type="tel" />
          <Field label="City" icon={MapPin} field="city" placeholder="City" />
          <Field label="State" icon={MapPin} field="state" placeholder="State" />
          <div className="sm:col-span-2">
            <Field label="Website" icon={Globe} field="website" placeholder="https://yoursite.com" type="url" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Timezone</label>
            {editing ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-violet-200 bg-violet-50 focus-within:border-violet-400 transition-colors">
                <Clock className="w-4 h-4 text-violet-400 flex-shrink-0" />
                <select
                  value={(editForm.timezone as string) ?? detectBrowserTimezone()}
                  onChange={(e) => setEditForm((f) => ({ ...f, timezone: e.target.value }))}
                  className="flex-1 bg-transparent text-sm text-slate-800 outline-none"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50">
                <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-sm text-slate-800">
                  {COMMON_TIMEZONES.find((tz) => tz.value === profile.timezone)?.label || profile.timezone || 'Not set'}
                </span>
              </div>
            )}
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Bio</label>
            {editing ? (
              <textarea
                value={(editForm.bio as string) ?? ''}
                onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))}
                placeholder="A short bio about yourself..."
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl border border-violet-200 bg-violet-50 focus:border-violet-400 text-sm text-slate-800 placeholder-slate-400 outline-none resize-none transition-colors"
              />
            ) : (
              <div className="px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50 min-h-[72px]">
                <span className={`text-sm ${profile.bio ? 'text-slate-800' : 'text-slate-400'}`}>
                  {profile.bio || 'Add a short bio...'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Connected Accounts */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-slate-900">Connected Accounts</h3>
          <button
            onClick={() => navigate('/settings')}
            className="text-xs text-violet-600 hover:text-violet-700 font-semibold"
          >
            Manage →
          </button>
        </div>

        <div className="space-y-3">
          {platforms.map(({ key, label, Icon, iconClass, bg, handle, followers, connected }) => (
            <div
              key={key}
              className={`flex items-center justify-between p-3 rounded-xl border ${
                connected ? 'border-emerald-100 bg-emerald-50/50' : 'border-slate-100 bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center`}>
                  <Icon className={`w-4.5 h-4.5 ${connected ? iconClass : 'text-slate-400'}`} style={{ width: '18px', height: '18px' }} />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${connected ? 'text-slate-900' : 'text-slate-400'}`}>
                    {connected ? (handle || label) : label}
                  </p>
                  {connected && followers > 0 && (
                    <p className="text-xs text-slate-500">{followers.toLocaleString()} followers</p>
                  )}
                  {connected && followers === 0 && (
                    <p className="text-xs text-slate-400">Connected</p>
                  )}
                  {!connected && (
                    <p className="text-xs text-slate-400">Not connected</p>
                  )}
                </div>
              </div>
              {connected ? (
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                  Connected
                </span>
              ) : (
                <button
                  onClick={() => navigate('/settings')}
                  className="text-[10px] font-bold text-violet-600 bg-violet-100 hover:bg-violet-200 px-2 py-0.5 rounded-full transition-colors"
                >
                  Connect
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
