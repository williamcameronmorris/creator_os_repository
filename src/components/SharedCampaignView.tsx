import React, { useState, useEffect } from 'react';
import { Calendar, Shield, Target, AlertTriangle, Briefcase } from 'lucide-react';

export default function SharedCampaignView() {
  const [campaignData, setCampaignData] = useState<any>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const dataParam = urlParams.get('data');

    if (dataParam) {
      try {
        const decoded = atob(dataParam);
        const data = JSON.parse(decoded);
        setCampaignData(data);
      } catch (err) {
        setError(true);
      }
    } else {
      setError(true);
    }
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Invalid Link</h2>
          <p className="text-slate-600">This campaign share link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  if (!campaignData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-sky-500 to-sky-600 rounded-2xl mx-auto mb-4 shadow-lg">
            <Briefcase className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Shared Campaign Details</h1>
          <p className="text-slate-600">View-only campaign brief and timeline</p>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-sky-50 border-b border-sky-100">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-sky-600" />
                <h2 className="text-lg font-bold text-slate-900">Campaign Brief</h2>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Primary Objective</label>
                <div className="inline-flex px-4 py-2 bg-sky-100 text-sky-900 rounded-lg font-medium">
                  {campaignData.objective}
                </div>
              </div>
              {campaignData.deliverables && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Deliverables</label>
                  <p className="text-slate-900 bg-slate-50 p-4 rounded-lg whitespace-pre-wrap">
                    {campaignData.deliverables}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-emerald-50 border-b border-emerald-100">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-bold text-slate-900">Scope & Usage Rights</h2>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Usage Type</label>
                  <p className="text-slate-900 font-medium">{campaignData.usageType}</p>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Duration</label>
                  <p className="text-slate-900 font-medium">{campaignData.usageDuration}</p>
                </div>
              </div>
              {campaignData.exclusivity && (
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Exclusivity</label>
                  <p className="text-slate-900 bg-slate-50 p-4 rounded-lg">{campaignData.exclusivity}</p>
                </div>
              )}
              {campaignData.scopeLocked && (
                <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 p-3 rounded-lg">
                  <Shield className="w-4 h-4" />
                  <span className="font-medium">Scope is locked and finalized</span>
                </div>
              )}
            </div>
          </div>

          {campaignData.timeline && campaignData.timeline.publishDate && (
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 bg-amber-50 border-b border-amber-100">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-amber-600" />
                  <h2 className="text-lg font-bold text-slate-900">Timeline</h2>
                </div>
              </div>
              <div className="p-6">
                <div className="relative pl-4 border-l-2 border-slate-200 space-y-6">
                  {[
                    { label: 'Target Publish Date', date: campaignData.timeline.publishDate },
                    { label: 'Final Approval Deadline', date: campaignData.timeline.finalApprovalDate },
                    { label: 'Revision Delivery Date', date: campaignData.timeline.revisionDeliveryDate },
                    { label: 'Brand Feedback Due', date: campaignData.timeline.feedbackDueDate },
                    { label: 'Draft Delivery Date', date: campaignData.timeline.draftDeliveryDate },
                  ].map((item, idx) => (
                    item.date && (
                      <div key={idx} className="relative">
                        <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-sky-500 border-2 border-white"></div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                          {item.label}
                        </label>
                        <p className="text-slate-900 font-medium">
                          {new Date(item.date).toLocaleDateString('en-US', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                    )
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 text-center text-sm text-slate-500">
          <p>Shared via Brand Deal OS</p>
        </div>
      </div>
    </div>
  );
}
