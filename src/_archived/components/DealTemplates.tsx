import { useState, useEffect } from 'react';
import { supabase, type DealTemplate } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Edit, Trash2, Save, X, AlertCircle } from 'lucide-react';

type DealTemplatesProps = {
  onSelectTemplate?: (template: DealTemplate) => void;
  compactMode?: boolean;
};

export function DealTemplates({ onSelectTemplate, compactMode = false }: DealTemplatesProps) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<DealTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState<Partial<DealTemplate>>({
    name: '',
    description: '',
    objective: 'Awareness',
    recommended_package: '',
    paid_usage: false,
    paid_usage_duration: 0,
    whitelisting: false,
    whitelisting_duration: 0,
    exclusivity: false,
    exclusivity_category: '',
    exclusivity_months: 0,
    rush_level: 'None',
    short_form_youtube: 0,
    short_form_tiktok: 0,
    short_form_instagram: 0,
    long_form_posts: 0,
    long_form_factor: 'mention',
  });

  useEffect(() => {
    if (user) {
      loadTemplates();
    }
  }, [user]);

  const loadTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('deal_templates')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setTemplates(data);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!user || !formData.name) {
      setError('Template name is required');
      return;
    }

    setError('');
    setSuccess('');

    try {
      if (editingId) {
        const { error: updateError } = await supabase
          .from('deal_templates')
          .update(formData)
          .eq('id', editingId);
        if (updateError) throw updateError;
        setSuccess('Template updated successfully!');
      } else {
        const { error: insertError } = await supabase
          .from('deal_templates')
          .insert({ ...formData, user_id: user.id });
        if (insertError) throw insertError;
        setSuccess('Template created successfully!');
      }

      setTimeout(() => setSuccess(''), 3000);
      loadTemplates();
      handleCancel();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEdit = (template: DealTemplate) => {
    setFormData(template);
    setEditingId(template.id);
    setIsEditing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    const { error } = await supabase.from('deal_templates').delete().eq('id', id);
    if (!error) {
      loadTemplates();
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormData({
      name: '',
      description: '',
      objective: 'Awareness',
      recommended_package: '',
      paid_usage: false,
      paid_usage_duration: 0,
      whitelisting: false,
      whitelisting_duration: 0,
      exclusivity: false,
      exclusivity_category: '',
      exclusivity_months: 0,
      rush_level: 'None',
      short_form_youtube: 0,
      short_form_tiktok: 0,
      short_form_instagram: 0,
      long_form_posts: 0,
      long_form_factor: 'mention',
    });
    setError('');
  };

  if (compactMode) {
    return (
      <div className="space-y-2">
        {templates.map((template) => (
          <button
            key={template.id}
            onClick={() => onSelectTemplate?.(template)}
            className="w-full text-left p-4 rounded-xl bg-card border border-border hover:border-primary/50 transition-colors"
          >
            <div className="font-semibold text-foreground mb-1">{template.name}</div>
            {template.description && (
              <div className="text-sm text-muted-foreground">{template.description}</div>
            )}
            <div className="mt-2 flex gap-2 text-xs">
              {template.recommended_package && (
                <span className="px-2 py-1 bg-primary/10 text-primary rounded-full font-medium">
                  {template.recommended_package}
                </span>
              )}
              {template.objective && (
                <span className="px-2 py-1 bg-muted text-foreground rounded-full font-medium">
                  {template.objective}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground mb-2">Deal Templates</h2>
          <p className="text-muted-foreground">Save time by creating reusable deal configurations</p>
        </div>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-colors flex items-center gap-2 px-6 py-3"
          >
            <Plus className="w-5 h-5" />
            New Template
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm flex items-start gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-chart-2/10 border border-chart-2/20 rounded-xl text-chart-2 text-sm">
          {success}
        </div>
      )}

      {isEditing && (
        <div className="mb-8 p-6 rounded-xl bg-card border border-border">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-foreground">
              {editingId ? 'Edit Template' : 'Create Template'}
            </h3>
            <button
              onClick={handleCancel}
              className="p-2 hover:bg-muted rounded-xl text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Template Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Express Package, Premium Brand Deal"
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description"
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Objective</label>
                <select
                  value={formData.objective}
                  onChange={(e) => setFormData({ ...formData, objective: e.target.value as DealTemplate['objective'] })}
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Select objective</option>
                  <option value="Awareness">Awareness</option>
                  <option value="Repurposing">Repurposing</option>
                  <option value="Conversion">Conversion</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Package</label>
                <select
                  value={formData.recommended_package}
                  onChange={(e) => setFormData({ ...formData, recommended_package: e.target.value as DealTemplate['recommended_package'] })}
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Select package</option>
                  <option value="Starter">Starter</option>
                  <option value="Core">Core</option>
                  <option value="Premium">Premium</option>
                  <option value="Platinum">Platinum</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>
            </div>

            <div className="border-t border-border pt-6">
              <h4 className="text-sm font-bold text-foreground mb-4">Default Deliverables</h4>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <label className="block text-sm text-muted-foreground mb-2 font-medium">YT Shorts</label>
                  <input
                    type="number"
                    value={formData.short_form_youtube}
                    onChange={(e) => setFormData({ ...formData, short_form_youtube: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div>
                  <label className="block text-sm text-muted-foreground mb-2 font-medium">TikToks</label>
                  <input
                    type="number"
                    value={formData.short_form_tiktok}
                    onChange={(e) => setFormData({ ...formData, short_form_tiktok: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div>
                  <label className="block text-sm text-muted-foreground mb-2 font-medium">IG Reels</label>
                  <input
                    type="number"
                    value={formData.short_form_instagram}
                    onChange={(e) => setFormData({ ...formData, short_form_instagram: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div>
                  <label className="block text-sm text-muted-foreground mb-2 font-medium">Long-Form</label>
                  <input
                    type="number"
                    value={formData.long_form_posts}
                    onChange={(e) => setFormData({ ...formData, long_form_posts: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div>
                  <label className="block text-sm text-muted-foreground mb-2 font-medium">LF Type</label>
                  <select
                    value={formData.long_form_factor}
                    onChange={(e) => setFormData({ ...formData, long_form_factor: e.target.value as DealTemplate['long_form_factor'] })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="mention">Mention</option>
                    <option value="adSpot">Ad Spot</option>
                    <option value="dedicated">Dedicated</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-6">
              <h4 className="text-sm font-bold text-foreground mb-4">Add-Ons</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="template_paid_usage"
                    checked={formData.paid_usage}
                    onChange={(e) => setFormData({ ...formData, paid_usage: e.target.checked })}
                    className="w-5 h-5 rounded border-border text-primary focus:ring-2 focus:ring-primary/50"
                  />
                  <label htmlFor="template_paid_usage" className="text-sm font-semibold text-foreground">Paid Usage</label>
                  {formData.paid_usage && (
                    <>
                      <input
                        type="number"
                        value={formData.paid_usage_duration}
                        onChange={(e) => setFormData({ ...formData, paid_usage_duration: parseInt(e.target.value) || 0 })}
                        placeholder="30"
                        className="w-20 px-2 py-1 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <span className="text-sm text-muted-foreground">days</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="template_whitelisting"
                    checked={formData.whitelisting}
                    onChange={(e) => setFormData({ ...formData, whitelisting: e.target.checked })}
                    className="w-5 h-5 rounded border-border text-primary focus:ring-2 focus:ring-primary/50"
                  />
                  <label htmlFor="template_whitelisting" className="text-sm font-semibold text-foreground">Whitelisting</label>
                  {formData.whitelisting && (
                    <>
                      <input
                        type="number"
                        value={formData.whitelisting_duration}
                        onChange={(e) => setFormData({ ...formData, whitelisting_duration: parseInt(e.target.value) || 0 })}
                        placeholder="30"
                        className="w-20 px-2 py-1 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <span className="text-sm text-muted-foreground">days</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="template_exclusivity"
                    checked={formData.exclusivity}
                    onChange={(e) => setFormData({ ...formData, exclusivity: e.target.checked })}
                    className="w-5 h-5 rounded border-border text-primary focus:ring-2 focus:ring-primary/50"
                  />
                  <label htmlFor="template_exclusivity" className="text-sm font-semibold text-foreground">Exclusivity</label>
                  {formData.exclusivity && (
                    <>
                      <input
                        type="number"
                        value={formData.exclusivity_months}
                        onChange={(e) => setFormData({ ...formData, exclusivity_months: parseInt(e.target.value) || 0 })}
                        placeholder="3"
                        className="w-20 px-2 py-1 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <span className="text-sm text-muted-foreground">months</span>
                    </>
                  )}
                </div>
              </div>

              {formData.exclusivity && (
                <div className="mt-4">
                  <label className="block text-sm font-semibold text-foreground mb-2">Exclusivity Category</label>
                  <input
                    type="text"
                    value={formData.exclusivity_category}
                    onChange={(e) => setFormData({ ...formData, exclusivity_category: e.target.value })}
                    placeholder="e.g., 'Tight - no health supplements'"
                    className="w-full px-4 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              )}

              <div className="mt-4">
                <label className="block text-sm font-semibold text-foreground mb-2">Rush Level</label>
                <select
                  value={formData.rush_level}
                  onChange={(e) => setFormData({ ...formData, rush_level: e.target.value as DealTemplate['rush_level'] })}
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="None">None</option>
                  <option value="Standard">Standard Rush (+25-50%)</option>
                  <option value="Extreme">Extreme Rush (+75-150%)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleSave}
              className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-colors flex items-center gap-2"
            >
              <Save className="w-5 h-5" />
              Save Template
            </button>
            <button
              onClick={handleCancel}
              className="px-6 py-3 bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-xl transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading templates...</div>
      ) : templates.length === 0 && !isEditing ? (
        <div className="text-center py-12 p-6 rounded-xl bg-card border border-border">
          <p className="text-muted-foreground mb-4">No templates yet</p>
          <button
            onClick={() => setIsEditing(true)}
            className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-colors"
          >
            Create Your First Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="p-6 rounded-xl bg-card border border-border hover:shadow-lg transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-foreground mb-1">{template.name}</h3>
                  {template.description && (
                    <p className="text-muted-foreground text-sm">{template.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEdit(template)}
                    className="p-2 hover:bg-muted rounded-xl text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="p-2 hover:bg-destructive/10 rounded-xl text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {template.recommended_package && (
                    <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-semibold">
                      {template.recommended_package}
                    </span>
                  )}
                  {template.objective && (
                    <span className="px-3 py-1 bg-muted text-foreground rounded-full text-xs font-semibold">
                      {template.objective}
                    </span>
                  )}
                </div>

                <div className="text-sm text-muted-foreground">
                  <div className="font-semibold text-foreground mb-1">Deliverables:</div>
                  <div className="flex flex-wrap gap-2">
                    {template.short_form_youtube > 0 && (
                      <span>{template.short_form_youtube} YT Shorts</span>
                    )}
                    {template.short_form_tiktok > 0 && (
                      <span>{template.short_form_tiktok} TikToks</span>
                    )}
                    {template.short_form_instagram > 0 && (
                      <span>{template.short_form_instagram} IG Reels</span>
                    )}
                    {template.long_form_posts > 0 && (
                      <span>{template.long_form_posts} Long-form</span>
                    )}
                  </div>
                </div>

                {(template.paid_usage || template.whitelisting || template.exclusivity) && (
                  <div className="text-sm text-muted-foreground">
                    <div className="font-semibold text-foreground mb-1">Add-ons:</div>
                    <div className="flex flex-wrap gap-2">
                      {template.paid_usage && <span>Paid Usage ({template.paid_usage_duration}d)</span>}
                      {template.whitelisting && <span>Whitelisting ({template.whitelisting_duration}d)</span>}
                      {template.exclusivity && <span>Exclusivity ({template.exclusivity_months}m)</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
