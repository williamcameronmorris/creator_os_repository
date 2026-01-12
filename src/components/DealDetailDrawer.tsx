import React, { useState, useEffect } from 'react';
import { X, Lock, Unlock, Calendar, Shield, Target, FileText, AlertTriangle, CheckCircle, Share2, Download, Copy, Link2, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

const DealDetailDrawer = ({ isOpen, onClose, deal = {} }) => {
  const [loadingDeal, setLoadingDeal] = useState(false);
  const [savingDeal, setSavingDeal] = useState(false);
  const [dealData, setDealData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('brief');
  const [isScopeLocked, setIsScopeLocked] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [formData, setFormData] = useState({
    objective: 'Awareness',
    keyMessage: '',
    prohibitedClaims: '',
    deliverables: '',
    usageType: 'Organic Only',
    usageDuration: '90 Days',
    exclusivity: '',
    publishDate: '',
    draftDeliveryDate: '',
    feedbackDueDate: '',
    revisionDeliveryDate: '',
    finalApprovalDate: '',
  });

  useEffect(() => {
    if (isOpen && deal?.id) {
      loadDealData(deal.id);
    }
  }, [isOpen, deal?.id]);

  const loadDealData = async (dealId: string) => {
    setLoadingDeal(true);
    try {
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .eq('id', dealId)
        .maybeSingle();

      if (data) {
        setDealData(data);
        setFormData({
          objective: data.objective || 'Awareness',
          keyMessage: data.key_message || '',
          prohibitedClaims: data.prohibited_claims || '',
          deliverables: data.requested_deliverables || '',
          usageType: data.paid_usage ? 'Paid Ads (Whitelisting)' : 'Organic Only',
          usageDuration: data.paid_usage_duration ? `${data.paid_usage_duration} Days` : '90 Days',
          exclusivity: data.exclusivity_category || '',
          publishDate: data.publish_date || '',
          draftDeliveryDate: data.draft_delivery_date || '',
          feedbackDueDate: data.feedback_due_date || '',
          revisionDeliveryDate: data.revision_delivery_date || '',
          finalApprovalDate: data.final_approval_date || '',
        });
        setIsScopeLocked(data.scope_locked || false);
      }
    } catch (error) {
      console.error('Error loading deal:', error);
    } finally {
      setLoadingDeal(false);
    }
  };

  const calculateTimeline = (publishDate) => {
    if (!publishDate) return;
    const target = new Date(publishDate);
    const subtractDays = (date, days) => {
      const result = new Date(date);
      result.setDate(result.getDate() - days);
      return result.toISOString().split('T')[0];
    };

    setFormData(prev => ({
      ...prev,
      publishDate,
      finalApprovalDate: subtractDays(target, 2),
      revisionDeliveryDate: subtractDays(target, 5),
      feedbackDueDate: subtractDays(target, 7),
      draftDeliveryDate: subtractDays(target, 10),
    }));
  };

  const exportAsText = () => {
    const text = `
CAMPAIGN DETAILS
================

PRIMARY OBJECTIVE: ${formData.objective}

KEY MESSAGE: ${formData.keyMessage || 'Not specified'}

PROHIBITED CLAIMS: ${formData.prohibitedClaims || 'None specified'}

DELIVERABLES:
${formData.deliverables || 'Not specified'}

USAGE RIGHTS:
- Type: ${formData.usageType}
- Duration: ${formData.usageDuration}

EXCLUSIVITY:
${formData.exclusivity || 'Not specified'}

TIMELINE:
- Publish Date: ${formData.publishDate || 'TBD'}
- Final Approval: ${formData.finalApprovalDate || 'TBD'}
- Revision Delivery: ${formData.revisionDeliveryDate || 'TBD'}
- Brand Feedback Due: ${formData.feedbackDueDate || 'TBD'}
- Draft Delivery: ${formData.draftDeliveryDate || 'TBD'}

SCOPE LOCKED: ${isScopeLocked ? 'Yes' : 'No'}
    `.trim();

    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const exportAsJSON = () => {
    const data = {
      campaign: {
        objective: formData.objective,
        keyMessage: formData.keyMessage,
        prohibitedClaims: formData.prohibitedClaims,
        deliverables: formData.deliverables,
        usageType: formData.usageType,
        usageDuration: formData.usageDuration,
        exclusivity: formData.exclusivity,
        timeline: {
          publishDate: formData.publishDate,
          finalApprovalDate: formData.finalApprovalDate,
          revisionDeliveryDate: formData.revisionDeliveryDate,
          feedbackDueDate: formData.feedbackDueDate,
          draftDeliveryDate: formData.draftDeliveryDate,
        },
        scopeLocked: isScopeLocked,
      },
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign-details-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowShareMenu(false);
  };

  const generateShareableLink = async () => {
    const campaignData = {
      objective: formData.objective,
      keyMessage: formData.keyMessage,
      prohibitedClaims: formData.prohibitedClaims,
      deliverables: formData.deliverables,
      usageType: formData.usageType,
      usageDuration: formData.usageDuration,
      exclusivity: formData.exclusivity,
      timeline: {
        publishDate: formData.publishDate,
        finalApprovalDate: formData.finalApprovalDate,
        revisionDeliveryDate: formData.revisionDeliveryDate,
        feedbackDueDate: formData.feedbackDueDate,
        draftDeliveryDate: formData.draftDeliveryDate,
      },
      scopeLocked: isScopeLocked,
    };

    const dataStr = btoa(JSON.stringify(campaignData));
    const shareUrl = `${window.location.origin}/share?data=${dataStr}`;

    navigator.clipboard.writeText(shareUrl);
    setCopySuccess(true);
    setTimeout(() => {
      setCopySuccess(false);
      setShowShareMenu(false);
    }, 2000);
  };

  const handleSave = async () => {
    if (!dealData?.id) return;

    setSavingDeal(true);
    try {
      const updateData: any = {
        objective: formData.objective,
        key_message: formData.keyMessage,
        prohibited_claims: formData.prohibitedClaims,
        requested_deliverables: formData.deliverables,
        paid_usage: formData.usageType !== 'Organic Only',
        exclusivity_category: formData.exclusivity,
        publish_date: formData.publishDate || null,
        draft_delivery_date: formData.draftDeliveryDate || null,
        feedback_due_date: formData.feedbackDueDate || null,
        revision_delivery_date: formData.revisionDeliveryDate || null,
        final_approval_date: formData.finalApprovalDate || null,
        scope_locked: isScopeLocked,
        updated_at: new Date().toISOString(),
      };

      if (formData.usageType !== 'Organic Only') {
        const durationMatch = formData.usageDuration.match(/\d+/);
        if (durationMatch) {
          updateData.paid_usage_duration = parseInt(durationMatch[0]);
        }
      }

      const { error } = await supabase
        .from('deals')
        .update(updateData)
        .eq('id', dealData.id);

      if (error) throw error;

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error('Error saving deal:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setSavingDeal(false);
    }
  };

  if (!isOpen) return null;

  if (loadingDeal) {
    return (
      <div className="fixed inset-0 z-50 overflow-hidden">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity" onClick={onClose} />
        <div className="fixed inset-y-0 right-0 pl-0 sm:pl-10 max-w-full flex">
          <div className="w-screen sm:max-w-2xl bg-card shadow-xl flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 pl-0 sm:pl-10 max-w-full flex">
        <div className="w-screen sm:max-w-2xl transform transition-all ease-in-out duration-500 sm:duration-700 bg-card shadow-xl flex flex-col h-full">

          <div className="px-4 sm:px-6 py-4 sm:py-6 bg-slate-900 dark:bg-slate-950 text-white flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl font-bold truncate">{dealData?.brand || 'Campaign Details'}</h2>
              <p className="text-slate-400 text-xs sm:text-sm hidden sm:block">{dealData ? 'Manage the deal lifecycle' : 'Loading...'}</p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <div className="relative">
                <button
                  onClick={() => setShowShareMenu(!showShareMenu)}
                  className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                  title="Share & Export"
                >
                  <Share2 size={20} />
                </button>

                {showShareMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowShareMenu(false)}
                    />
                    <div className="absolute right-0 mt-2 w-64 bg-card rounded-xl shadow-xl border border-border overflow-hidden z-20">
                      <div className="p-2 bg-muted border-b border-border">
                        <p className="text-xs font-semibold text-foreground px-2 py-1">Share & Export</p>
                      </div>
                      <div className="p-2 space-y-1">
                        <button
                          onClick={exportAsText}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left"
                        >
                          <Copy size={16} className="text-muted-foreground" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">Copy as Text</p>
                            <p className="text-xs text-muted-foreground">Formatted campaign details</p>
                          </div>
                          {copySuccess && <Check size={16} className="text-emerald-600" />}
                        </button>

                        <button
                          onClick={exportAsJSON}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left"
                        >
                          <Download size={16} className="text-muted-foreground" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">Download JSON</p>
                            <p className="text-xs text-muted-foreground">Machine-readable format</p>
                          </div>
                        </button>

                        <button
                          onClick={generateShareableLink}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left"
                        >
                          <Link2 size={16} className="text-muted-foreground" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">Copy Share Link</p>
                            <p className="text-xs text-muted-foreground">Share with anyone</p>
                          </div>
                          {copySuccess && <Check size={16} className="text-emerald-600" />}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>
          </div>

          <div className="border-b border-border flex px-4 sm:px-6 space-x-4 sm:space-x-8 bg-card overflow-x-auto">
            {[
              { id: 'brief', label: 'Brief', icon: Target },
              { id: 'scope', label: 'Scope', icon: Shield },
              { id: 'timeline', label: 'Timeline', icon: Calendar }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 sm:py-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-chart-2 text-chart-2'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <tab.icon size={16} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-muted/30">

            {activeTab === 'brief' && (
              <div className="space-y-4 sm:space-y-6">
                <div className="bg-card p-4 sm:p-6 rounded-xl border border-border shadow-sm">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2 text-sm sm:text-base">
                    <Target size={18} className="text-chart-2"/>
                    Primary Objective (A-R-C)
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      { name: 'Awareness', desc: 'Focus on views & CPM.' },
                      { name: 'Repurposing', desc: 'Focus on quality & rights.' },
                      { name: 'Conversion', desc: 'Focus on clicks & sales.' }
                    ].map((obj) => (
                      <button
                        key={obj.name}
                        onClick={() => setFormData({...formData, objective: obj.name})}
                        className={`p-4 rounded-lg border text-left transition-all ${
                          formData.objective === obj.name
                            ? 'border-chart-2 bg-chart-2/10 ring-2 ring-chart-2/20'
                            : 'border-border hover:border-chart-2/50 bg-card'
                        }`}
                      >
                        <span className="block font-bold text-base text-foreground">{obj.name}</span>
                        <span className="block text-sm text-muted-foreground mt-1">{obj.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-card p-4 sm:p-6 rounded-xl border border-border shadow-sm space-y-4">
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-foreground mb-2">Key Message (Talking Points)</label>
                    <textarea
                      rows={3}
                      value={formData.keyMessage}
                      onChange={(e) => setFormData({...formData, keyMessage: e.target.value})}
                      className="w-full p-3 border border-border rounded-lg text-sm focus:ring-2 focus:ring-chart-2 focus:border-chart-2 outline-none bg-background text-foreground"
                      placeholder="What is the ONE thing they want the audience to remember?"
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-foreground mb-2">Prohibited Claims</label>
                    <input
                      type="text"
                      value={formData.prohibitedClaims}
                      onChange={(e) => setFormData({...formData, prohibitedClaims: e.target.value})}
                      className="w-full p-3 border border-border rounded-lg text-sm focus:ring-2 focus:ring-chart-2 focus:border-chart-2 outline-none bg-background text-foreground"
                      placeholder="What are you NOT allowed to say?"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'scope' && (
              <div className="space-y-4 sm:space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-card p-4 sm:p-6 rounded-xl border border-border shadow-sm gap-3 sm:gap-0">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${isScopeLocked ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                      {isScopeLocked ? <Lock size={20} /> : <Unlock size={20} />}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-foreground">Scope Lock</p>
                      <p className="text-xs text-muted-foreground">Lock this once contract is signed.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsScopeLocked(!isScopeLocked)}
                    className={`text-xs font-bold px-4 py-2 rounded-lg transition-colors ${
                      isScopeLocked
                        ? 'bg-muted text-foreground hover:bg-accent'
                        : 'bg-chart-2 text-white hover:bg-chart-2/90'
                    }`}
                  >
                    {isScopeLocked ? 'Unlock Scope' : 'Lock Scope'}
                  </button>
                </div>

                <div className={`bg-card p-4 sm:p-6 rounded-xl border border-border shadow-sm space-y-4 sm:space-y-6 ${isScopeLocked ? 'opacity-75 pointer-events-none' : ''}`}>
                  <div>
                    <label className="block text-xs font-bold uppercase text-muted-foreground mb-2 tracking-wide">D - Deliverables</label>
                    <textarea
                      className="w-full p-3 border border-border rounded-lg text-sm bg-background text-foreground focus:ring-2 focus:ring-chart-2 focus:border-chart-2 outline-none"
                      rows={3}
                      value={formData.deliverables}
                      onChange={(e) => setFormData({...formData, deliverables: e.target.value})}
                      placeholder="2 reels, 2 TikTok's, 2 shorts, 1 longform"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase text-muted-foreground mb-2 tracking-wide">U - Usage Type</label>
                      <select
                        className="w-full p-3 border border-border rounded-lg text-sm bg-background text-foreground focus:ring-2 focus:ring-chart-2 focus:border-chart-2 outline-none"
                        value={formData.usageType}
                        onChange={(e) => setFormData({...formData, usageType: e.target.value})}
                      >
                        <option>Organic Only</option>
                        <option>Paid Ads (Whitelisting)</option>
                        <option>Full Digital Rights</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-muted-foreground mb-2 tracking-wide">Duration</label>
                      <select
                        className="w-full p-3 border border-border rounded-lg text-sm bg-background text-foreground focus:ring-2 focus:ring-chart-2 focus:border-chart-2 outline-none"
                        value={formData.usageDuration}
                        onChange={(e) => setFormData({...formData, usageDuration: e.target.value})}
                      >
                        <option>30 Days</option>
                        <option>90 Days</option>
                        <option>6 Months</option>
                        <option>1 Year</option>
                        <option>Perpetuity (⚠️ Charge More)</option>
                      </select>
                    </div>
                  </div>

                  {formData.usageDuration.includes('Perpetuity') && (
                    <div className="flex gap-2 items-center text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                      <AlertTriangle size={14} />
                      <p>"Unlimited usage in perpetuity" is a major licensing deal. Price accordingly.</p>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold uppercase text-muted-foreground mb-2 tracking-wide">E - Exclusivity</label>
                    <input
                      type="text"
                      className="w-full p-3 border border-border rounded-lg text-sm bg-background text-foreground focus:ring-2 focus:ring-chart-2 focus:border-chart-2 outline-none"
                      placeholder="e.g. Skincare category, no Nivea or Olay"
                      value={formData.exclusivity}
                      onChange={(e) => setFormData({...formData, exclusivity: e.target.value})}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'timeline' && (
              <div className="space-y-4 sm:space-y-6">
                <div className="bg-chart-2/10 border border-chart-2/20 p-4 rounded-xl flex gap-3">
                  <div className="bg-chart-2/20 p-2 rounded-full h-fit text-chart-2"><Calendar size={18} /></div>
                  <div>
                    <h4 className="font-bold text-foreground text-sm">Timelines Brands Respect</h4>
                    <p className="text-xs text-muted-foreground mt-1">Select your Publish Date, and we'll calculate the rest to ensure you get paid on time.</p>
                  </div>
                </div>

                <div className="bg-card p-4 sm:p-6 rounded-xl border border-border shadow-sm space-y-4 sm:space-y-6">
                  <div>
                    <label className="block text-sm font-bold text-foreground mb-2 flex items-center gap-1">
                      <span>🚀</span> Target Publish Date
                    </label>
                    <input
                      type="date"
                      value={formData.publishDate}
                      className="w-full p-3 border-2 border-chart-2/30 rounded-lg text-sm focus:border-chart-2 outline-none bg-background text-foreground"
                      onChange={(e) => calculateTimeline(e.target.value)}
                    />
                  </div>

                  <div className="relative pl-4 border-l-2 border-border space-y-4 sm:space-y-6">
                    {[
                      { label: "Final Approval Deadline", date: formData.finalApprovalDate, note: "2 days before live" },
                      { label: "Revision Delivery Date", date: formData.revisionDeliveryDate, note: "5 days before live" },
                      { label: "Brand Feedback Due", date: formData.feedbackDueDate, note: "7 days before live" },
                      { label: "Draft Delivery Date", date: formData.draftDeliveryDate, note: "10 days before live" },
                    ].map((item, idx) => (
                      <div key={idx} className="relative">
                        <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-muted border-2 border-card"></div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">{item.label}</label>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-2">
                          <input
                            type="date"
                            className="bg-muted border border-border rounded-lg p-2 text-sm text-foreground w-full sm:w-auto"
                            value={item.date}
                            readOnly
                          />
                          <span className="text-xs text-muted-foreground italic">{item.note}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 sm:p-6 border-t border-border bg-card">
            <button
              onClick={handleSave}
              disabled={savingDeal}
              className="w-full py-3 bg-slate-900 dark:bg-slate-950 hover:bg-slate-800 dark:hover:bg-slate-900 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saveSuccess && <CheckCircle size={20} />}
              {savingDeal ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Changes'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default DealDetailDrawer;
