import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { ArrowLeft, AlertTriangle, Save } from 'lucide-react';

interface ProfileForm {
  first_name: string;
  last_name: string;
  email: string;
  niche_preference: string;
  posting_frequency: string;
  primary_platform: string;
  notes: string;
}

const PLATFORM_OPTIONS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'threads', label: 'Threads' },
];

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: '3-4-week', label: '3–4 / week' },
  { value: '1-2-week', label: '1–2 / week' },
  { value: 'monthly', label: 'A few times a month' },
];

export function Profile() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState<ProfileForm>({
    first_name: '',
    last_name: '',
    email: user?.email || '',
    niche_preference: '',
    posting_frequency: '',
    primary_platform: '',
    notes: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        if (data) {
          setForm({
            first_name: data.first_name || '',
            last_name: data.last_name || '',
            email: user.email || data.email || '',
            niche_preference: data.niche_preference || '',
            posting_frequency: data.posting_frequency || '',
            primary_platform: data.primary_platform || '',
            notes: data.notes || '',
          });
        }
      } catch (e: any) {
        setError(e.message || 'Failed to load profile.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const updates = {
        id: user.id,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        niche_preference: form.niche_preference.trim(),
        posting_frequency: form.posting_frequency,
        primary_platform: form.primary_platform,
        notes: form.notes.trim(),
        updated_at: new Date().toISOString(),
      };

      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert(updates, { onConflict: 'id' });

      if (upsertError) throw upsertError;

      if (form.email && form.email !== user.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: form.email,
        });
        if (emailError) throw emailError;
      }

      setSavedAt(new Date());
    } catch (e: any) {
      setError(e.message || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    if (confirmText.trim() !== 'DELETE MY ACCOUNT') {
      setDeleteError('Confirmation text does not match.');
      return;
    }
    setDeleting(true);
    setDeleteError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
        }
      );

      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || 'Account deletion failed.');
      }

      await signOut();
      navigate('/auth', { replace: true });
    } catch (e: any) {
      setDeleteError(e.message || 'Account deletion failed.');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-1.5 h-1.5 bg-foreground animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <div className="t-micro mb-2">
        <span className="text-foreground">04</span>
        <span className="mx-2 text-muted-foreground">/</span>
        <span>PROFILE</span>
      </div>

      <h1
        className="text-foreground mb-2"
        style={{
          fontSize: 'clamp(2rem, 5vw, 3.5rem)',
          fontWeight: 500,
          letterSpacing: '-0.03em',
          lineHeight: 1.05,
        }}
      >
        Your{' '}
        <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>profile.</em>
      </h1>
      <p className="t-body mb-10" style={{ maxWidth: '52ch' }}>
        Tell us a little about you and how you create. We use this to make Clio
        and Studio recommendations more relevant.
      </p>

      <section className="mb-10">
        <div className="t-micro mb-4 pb-2 border-b border-border">IDENTITY</div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Field
            label="First name"
            value={form.first_name}
            onChange={(v) => setForm({ ...form, first_name: v })}
            placeholder="Cam"
          />
          <Field
            label="Last name"
            value={form.last_name}
            onChange={(v) => setForm({ ...form, last_name: v })}
            placeholder="Morris"
          />
        </div>

        <Field
          label="Email"
          value={form.email}
          onChange={(v) => setForm({ ...form, email: v })}
          placeholder="you@domain.com"
          type="email"
          help="Changing your email will require re-verification."
        />
      </section>

      <section className="mb-10">
        <div className="t-micro mb-4 pb-2 border-b border-border">
          RECOMMENDATIONS
        </div>

        <Field
          label="Niche or focus"
          value={form.niche_preference}
          onChange={(v) => setForm({ ...form, niche_preference: v })}
          placeholder="Guitar gear, vintage amps, recording tips…"
          help="Describe what you make so Clio can pull more relevant ideas."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <SelectField
            label="Primary platform"
            value={form.primary_platform}
            onChange={(v) => setForm({ ...form, primary_platform: v })}
            options={PLATFORM_OPTIONS}
          />
          <SelectField
            label="Posting frequency"
            value={form.posting_frequency}
            onChange={(v) => setForm({ ...form, posting_frequency: v })}
            options={FREQUENCY_OPTIONS}
          />
        </div>

        <div className="mt-4">
          <label className="t-micro block mb-2">NOTES FOR CLIO</label>
          <textarea
            className="w-full bg-transparent border border-border px-3 py-2 text-foreground focus:outline-none focus:border-accent transition-colors"
            style={{ minHeight: 96, fontSize: '14px', borderRadius: 0 }}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Anything Clio should always keep in mind: brand voice, no-go topics, audience details, etc."
          />
        </div>
      </section>

      <div className="flex items-center gap-4 mb-16 pb-10 border-b border-border">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-ie inline-flex items-center gap-2 disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          <span className="btn-ie-text">{saving ? 'Saving…' : 'Save changes'}</span>
        </button>
        {savedAt && (
          <span className="t-micro text-muted-foreground">
            SAVED {savedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }).toUpperCase()}
          </span>
        )}
        {error && (
          <span className="t-micro" style={{ color: 'var(--destructive, #c0392b)' }}>
            {error}
          </span>
        )}
      </div>

      <section>
        <div
          className="t-micro mb-4 pb-2 border-b border-border"
          style={{ color: 'var(--destructive, #c0392b)' }}
        >
          DANGER ZONE
        </div>

        <div
          className="p-5 border border-border"
          style={{ borderColor: 'var(--destructive, #c0392b)' }}
        >
          <div className="flex items-start gap-3 mb-3">
            <AlertTriangle
              className="w-4 h-4 mt-0.5 flex-shrink-0"
              style={{ color: 'var(--destructive, #c0392b)' }}
            />
            <div>
              <div className="text-foreground font-semibold mb-1" style={{ fontSize: '15px' }}>
                Delete account
              </div>
              <p className="t-body" style={{ maxWidth: '54ch' }}>
                Permanently removes your profile, posts, scheduled content, saved
                ideas, social connections, and all associated data. This cannot
                be undone.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowDeleteModal(true)}
            className="t-micro inline-flex items-center gap-2 px-3 py-2 border transition-colors"
            style={{
              borderColor: 'var(--destructive, #c0392b)',
              color: 'var(--destructive, #c0392b)',
              borderRadius: 0,
            }}
          >
            DELETE MY ACCOUNT
          </button>
        </div>
      </section>

      <div className="mt-12">
        <button
          onClick={() => navigate('/settings')}
          className="t-micro inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          BACK TO SETTINGS
        </button>
      </div>

      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => !deleting && setShowDeleteModal(false)}
        >
          <div
            className="w-full max-w-md bg-background border p-6"
            style={{ borderColor: 'var(--destructive, #c0392b)', borderRadius: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="t-micro mb-3" style={{ color: 'var(--destructive, #c0392b)' }}>
              CONFIRM DELETION
            </div>
            <h2
              className="text-foreground mb-3"
              style={{ fontSize: '1.5rem', fontWeight: 500, letterSpacing: '-0.02em' }}
            >
              This will permanently erase your account.
            </h2>
            <p className="t-body mb-5">
              All scheduled posts, saved ideas, analytics history, and connected
              social profiles will be removed. There is no recovery.
            </p>

            <label className="t-micro block mb-2">
              TYPE <span className="text-foreground">DELETE MY ACCOUNT</span> TO CONFIRM
            </label>
            <input
              type="text"
              className="w-full bg-transparent border border-border px-3 py-2 text-foreground mb-4 focus:outline-none"
              style={{ borderRadius: 0, fontSize: '14px' }}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={deleting}
              autoFocus
            />

            {deleteError && (
              <div className="t-micro mb-4" style={{ color: 'var(--destructive, #c0392b)' }}>
                {deleteError}
              </div>
            )}

            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setConfirmText('');
                  setDeleteError(null);
                }}
                disabled={deleting}
                className="t-micro px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting || confirmText.trim() !== 'DELETE MY ACCOUNT'}
                className="t-micro px-3 py-2 border disabled:opacity-40 transition-colors"
                style={{
                  borderColor: 'var(--destructive, #c0392b)',
                  color: 'var(--destructive, #c0392b)',
                  borderRadius: 0,
                }}
              >
                {deleting ? 'DELETING…' : 'PERMANENTLY DELETE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  help?: string;
}) {
  return (
    <div>
      <label className="t-micro block mb-2">{label.toUpperCase()}</label>
      <input
        type={type}
        className="w-full bg-transparent border border-border px-3 py-2 text-foreground focus:outline-none focus:border-accent transition-colors"
        style={{ borderRadius: 0, fontSize: '14px' }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {help && <p className="t-micro text-muted-foreground mt-1.5">{help}</p>}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="t-micro block mb-2">{label.toUpperCase()}</label>
      <select
        className="w-full bg-transparent border border-border px-3 py-2 text-foreground focus:outline-none focus:border-accent transition-colors"
        style={{ borderRadius: 0, fontSize: '14px' }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select…</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
