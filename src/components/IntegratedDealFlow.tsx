import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { calculateRate } from '../lib/pricing';
import { getSmartDefaults } from '../lib/smartDefaults';
import { X, DollarSign, TrendingUp, Copy, CheckCircle, Sparkles, FileText } from 'lucide-react';

interface IntegratedDealFlowProps {
  mode: 'brand-contacted' | 'pitch-brand' | 'explore-rates';
  onClose: () => void;
  onSuccess?: () => void;
}

interface Template {
  id: string;
  name: string;
  description?: string;
  recommended_package?: string;
}

interface CopySnippet {
  id: string;
  label: string;
  text: string;
  category: string;
  is_favorite?: boolean;
}

interface FormData {
  brandName: string;
  deliverableType: string;
  followerCount: number;
  platform: string;
  urgency: string;
  exclusivity: boolean;
  usageRights: string;
  priority: string;
  expectedCloseDate: string;
}

export default function IntegratedDealFlow({ mode, onClose, onSuccess }: IntegratedDealFlowProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    brandName: '',
    deliverableType: 'Instagram Story',
    followerCount: 10000,
    platform: 'Instagram',
    urgency: 'standard',
    exclusivity: false,
    usageRights: 'organic',
    priority: 'medium',
    expectedCloseDate: '',
  });
  const [calculatedRate, setCalculatedRate] = useState(0);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [copySnippets, setCopySnippets] = useState<CopySnippet[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTemplatesAndSnippets();
  }, []);

  useEffect(() => {
    const rate = calculateRate(
      formData.followerCount,
      formData.deliverableType,
      formData.platform,
      {
        urgency: formData.urgency,
        exclusivity: formData.exclusivity,
        usageRights: formData.usageRights,
      }
    );
    setCalculatedRate(rate);
  }, [formData]);

  const loadTemplatesAndSnippets = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [templatesResult, snippetsResult] = await Promise.all([
        supabase
          .from('deal_templates')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('copy_snippets')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      if (templatesResult.data) setTemplates(templatesResult.data);
      if (snippetsResult.data) setCopySnippets(snippetsResult.data);
    } catch (error) {
      console.error('Error loading templates and snippets:', error);
      setTemplates([]);
      setCopySnippets([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleCopySnippet = async (snippet: CopySnippet) => {
    await navigator.clipboard.writeText(snippet.text);
    setCopiedSnippet(snippet.id);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const handleSaveDeal = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: stages } = await supabase
        .from('deal_stages')
        .select('id')
        .eq('user_id', user.id)
        .order('position')
        .limit(1);

      const stageId = stages?.[0]?.id;

      const { data: deal, error } = await supabase
        .from('deals')
        .insert({
          user_id: user.id,
          brand_name: formData.brandName,
          deliverable_type: formData.deliverableType,
          rate: calculatedRate,
          status: 'active',
          stage_id: stageId,
          priority: formData.priority,
          expected_close_date: formData.expectedCloseDate || null,
        })
        .select()
        .single();

      if (error) throw error;

      await supabase
        .from('deal_activities')
        .insert({
          deal_id: deal.id,
          user_id: user.id,
          activity_type: 'created',
          description: `Created deal with ${formData.brandName}`,
          metadata: { mode, calculated_rate: calculatedRate },
        });

      onSuccess?.();
    } catch (error) {
      console.error('Error saving deal:', error);
    } finally {
      setSaving(false);
    }
  };

  const getRelevantSnippets = () => {
    if (mode === 'brand-contacted') {
      return copySnippets.filter(s => s.category === 'response' || s.category === 'rates');
    } else if (mode === 'pitch-brand') {
      return copySnippets.filter(s => s.category === 'pitch' || s.category === 'intro');
    }
    return copySnippets.slice(0, 5);
  };

  const getSuggestedTemplates = () => {
    return templates.slice(0, 3);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getTitle = () => {
    switch (mode) {
      case 'brand-contacted':
        return 'Brand Contacted You';
      case 'pitch-brand':
        return 'Pitch a Brand';
      case 'explore-rates':
        return 'Explore Your Rates';
      default:
        return 'Create Deal';
    }
  };

  const getDescription = () => {
    switch (mode) {
      case 'brand-contacted':
        return 'Calculate your rate and respond with confidence';
      case 'pitch-brand':
        return 'Build your pitch and track the opportunity';
      case 'explore-rates':
        return 'See what you should be charging';
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-slate-900 bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="card-soft p-8 animate-scale-in">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
            <p className="text-slate-700 font-medium">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900 bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-3xl soft-shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-scale-in">
        <div className="card-pastel-sky p-8 flex items-center justify-between border-b border-sky-100">
          <div>
            <h2 className="text-3xl font-bold mb-2 text-slate-900">{getTitle()}</h2>
            <p className="text-sky-700 font-medium">{getDescription()}</p>
          </div>
          <button
            onClick={onClose}
            className="icon-container-sky w-10 h-10 rounded-xl flex items-center justify-center hover:bg-sky-200 transition-colors"
          >
            <X className="w-5 h-5 text-sky-700" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="card-soft p-8">
                <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-3">
                  <div className="icon-container-lavender w-10 h-10 rounded-xl flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-purple-700" />
                  </div>
                  Deal Details
                </h3>

                <div className="grid md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Brand Name
                    </label>
                    <input
                      type="text"
                      value={formData.brandName}
                      onChange={(e) => handleInputChange('brandName', e.target.value)}
                      placeholder="Enter brand name"
                      className="input-soft w-full px-4 py-3 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Deliverable Type
                    </label>
                    <select
                      value={formData.deliverableType}
                      onChange={(e) => handleInputChange('deliverableType', e.target.value)}
                      className="input-soft w-full px-4 py-3 text-slate-900"
                    >
                      <option>Instagram Story</option>
                      <option>Instagram Post</option>
                      <option>Instagram Reel</option>
                      <option>TikTok Video</option>
                      <option>YouTube Video</option>
                      <option>YouTube Short</option>
                      <option>Blog Post</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Follower Count
                    </label>
                    <input
                      type="number"
                      value={formData.followerCount}
                      onChange={(e) => handleInputChange('followerCount', parseInt(e.target.value))}
                      className="input-soft w-full px-4 py-3 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Platform
                    </label>
                    <select
                      value={formData.platform}
                      onChange={(e) => handleInputChange('platform', e.target.value)}
                      className="input-soft w-full px-4 py-3 text-slate-900"
                    >
                      <option>Instagram</option>
                      <option>TikTok</option>
                      <option>YouTube</option>
                      <option>Twitter</option>
                      <option>Blog</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Priority
                    </label>
                    <select
                      value={formData.priority}
                      onChange={(e) => handleInputChange('priority', e.target.value)}
                      className="input-soft w-full px-4 py-3 text-slate-900"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Expected Close Date
                    </label>
                    <input
                      type="date"
                      value={formData.expectedCloseDate}
                      onChange={(e) => handleInputChange('expectedCloseDate', e.target.value)}
                      className="input-soft w-full px-4 py-3 text-slate-900"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-3">
                      Urgency & Modifiers
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <select
                        value={formData.urgency}
                        onChange={(e) => handleInputChange('urgency', e.target.value)}
                        className="input-soft px-4 py-3 text-slate-900"
                      >
                        <option value="standard">Standard Timeline</option>
                        <option value="rush">Rush (+25%)</option>
                      </select>
                      <label className="flex items-center gap-2 px-5 py-3 bg-white border-2 border-slate-100 rounded-xl cursor-pointer hover:border-sky-200 transition-colors text-slate-900 font-medium">
                        <input
                          type="checkbox"
                          checked={formData.exclusivity}
                          onChange={(e) => handleInputChange('exclusivity', e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-sm">Exclusivity (+30%)</span>
                      </label>
                      <select
                        value={formData.usageRights}
                        onChange={(e) => handleInputChange('usageRights', e.target.value)}
                        className="input-soft px-4 py-3 text-slate-900"
                      >
                        <option value="organic">Organic Only</option>
                        <option value="paid">Paid Ads (+50%)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {getSuggestedTemplates().length > 0 && (
                <div className="card-soft p-8">
                  <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-3">
                    <div className="icon-container-sky w-10 h-10 rounded-xl flex items-center justify-center">
                      <FileText className="w-5 h-5 text-sky-700" />
                    </div>
                    Suggested Templates
                  </h3>
                  <div className="space-y-3">
                    {getSuggestedTemplates().map((template) => (
                      <button
                        key={template.id}
                        onClick={() => setSelectedTemplate(template)}
                        className="w-full text-left p-5 bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-2xl hover:shadow-md transition-all-smooth"
                      >
                        <div className="font-bold text-slate-900">{template.name}</div>
                        <div className="text-sm text-slate-600 mt-1">{template.description || template.recommended_package || 'Template'}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="card-soft card-pastel-sky p-8 sticky top-0">
                <div className="icon-container-sky w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
                  <TrendingUp className="w-6 h-6 text-sky-700" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Live Rate</h3>
                <div className="text-5xl font-bold mb-4 text-slate-900">
                  {formatCurrency(calculatedRate)}
                </div>
                <p className="text-sky-700 text-sm mb-6 font-medium">
                  Based on your audience size and deliverable type
                </p>
                {mode !== 'explore-rates' && (
                  <button
                    onClick={handleSaveDeal}
                    disabled={!formData.brandName || saving}
                    className="btn-soft w-full bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving...' : 'Save Deal'}
                  </button>
                )}
              </div>

              {getRelevantSnippets().length > 0 && (
                <div className="card-soft p-8">
                  <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-3">
                    <div className="icon-container-emerald w-10 h-10 rounded-xl flex items-center justify-center">
                      <Copy className="w-5 h-5 text-emerald-700" />
                    </div>
                    Quick Copy
                  </h3>
                  <div className="space-y-3">
                    {getRelevantSnippets().map((snippet) => (
                      <button
                        key={snippet.id}
                        onClick={() => handleCopySnippet(snippet)}
                        className="w-full text-left p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-2xl hover:shadow-md transition-all-smooth group"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-semibold text-slate-900 text-sm mb-1">
                              {snippet.label}
                            </div>
                            <div className="text-xs text-slate-600 line-clamp-2">
                              {snippet.text}
                            </div>
                          </div>
                          {copiedSnippet === snippet.id ? (
                            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 ml-2" />
                          ) : (
                            <Copy className="w-5 h-5 text-slate-400 group-hover:text-emerald-600 flex-shrink-0 ml-2" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}