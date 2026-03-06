import { Package, Clock, Shield, Plus, X } from 'lucide-react';
import { useState } from 'react';

interface Deliverable {
  type: string;
  length?: string;
  quantity: number;
  specs?: string;
}

interface DueDetailsFormProps {
  deliverablesList: Deliverable[];
  usagePlatforms: string[];
  usageStartDate: string;
  usageEndDate: string;
  exclusivity: boolean;
  exclusivityCompetitors: string[];
  exclusivityStartDate: string;
  exclusivityEndDate: string;
  onChange: (field: string, value: any) => void;
}

export default function DueDetailsForm({
  deliverablesList,
  usagePlatforms,
  usageStartDate,
  usageEndDate,
  exclusivity,
  exclusivityCompetitors,
  exclusivityStartDate,
  exclusivityEndDate,
  onChange,
}: DueDetailsFormProps) {
  const [newDeliverable, setNewDeliverable] = useState<Partial<Deliverable>>({
    type: '',
    quantity: 1,
  });
  const [newCompetitor, setNewCompetitor] = useState('');

  const platformOptions = [
    'YouTube Organic',
    'YouTube Paid Ads',
    'TikTok Organic',
    'TikTok Paid Ads',
    'Instagram Organic',
    'Instagram Paid Ads',
    'Facebook Organic',
    'Facebook Paid Ads',
    'Twitter/X Organic',
    'Twitter/X Paid Ads',
    'Brand Website',
    'Brand Email Marketing',
  ];

  const deliverableTypes = [
    'YouTube Video (Long-form)',
    'YouTube Short',
    'TikTok Video',
    'Instagram Reel',
    'Instagram Story',
    'Instagram Post',
    'Twitter/X Post',
    'Blog Post',
    'Newsletter Mention',
  ];

  const addDeliverable = () => {
    if (newDeliverable.type && newDeliverable.quantity) {
      onChange('deliverablesList', [...deliverablesList, newDeliverable as Deliverable]);
      setNewDeliverable({ type: '', quantity: 1 });
    }
  };

  const removeDeliverable = (index: number) => {
    onChange(
      'deliverablesList',
      deliverablesList.filter((_, i) => i !== index)
    );
  };

  const addCompetitor = () => {
    if (newCompetitor.trim()) {
      onChange('exclusivityCompetitors', [...exclusivityCompetitors, newCompetitor.trim()]);
      setNewCompetitor('');
    }
  };

  const removeCompetitor = (index: number) => {
    onChange(
      'exclusivityCompetitors',
      exclusivityCompetitors.filter((_, i) => i !== index)
    );
  };

  const togglePlatform = (platform: string) => {
    if (usagePlatforms.includes(platform)) {
      onChange(
        'usagePlatforms',
        usagePlatforms.filter((p) => p !== platform)
      );
    } else {
      onChange('usagePlatforms', [...usagePlatforms, platform]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">The DUE Model</h3>
        <p className="text-sm text-blue-700">
          Define exactly what you're selling: <strong>D</strong>eliverables (your work), <strong>U</strong>sage (their licensing),
          <strong>E</strong>xclusivity (category rental). This prevents scope creep and ensures fair pricing.
        </p>
      </div>

      {/* DELIVERABLES SECTION */}
      <div className="border border-gray-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <Package className="w-5 h-5 text-gray-600" />
          <h4 className="font-semibold text-gray-900">D — Deliverables</h4>
        </div>
        <p className="text-sm text-gray-600 mb-4">What you will physically create and deliver.</p>

        {/* Existing Deliverables */}
        {deliverablesList.length > 0 && (
          <div className="space-y-2 mb-4">
            {deliverablesList.map((deliverable, index) => (
              <div key={index} className="flex items-center justify-between bg-gray-50 p-3 rounded">
                <div className="flex-1">
                  <p className="font-medium text-sm text-gray-900">{deliverable.type}</p>
                  <div className="flex gap-3 text-xs text-gray-600 mt-1">
                    <span>Quantity: {deliverable.quantity}</span>
                    {deliverable.length && <span>Length: {deliverable.length}</span>}
                    {deliverable.specs && <span>{deliverable.specs}</span>}
                  </div>
                </div>
                <button
                  onClick={() => removeDeliverable(index)}
                  className="text-red-500 hover:text-red-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add New Deliverable */}
        <div className="grid grid-cols-12 gap-2">
          <select
            value={newDeliverable.type || ''}
            onChange={(e) => setNewDeliverable({ ...newDeliverable, type: e.target.value })}
            className="col-span-6 border border-gray-300 rounded px-3 py-2 text-sm"
          >
            <option value="">Select deliverable type...</option>
            {deliverableTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          <input
            type="number"
            min="1"
            value={newDeliverable.quantity || 1}
            onChange={(e) =>
              setNewDeliverable({ ...newDeliverable, quantity: parseInt(e.target.value) || 1 })
            }
            placeholder="Qty"
            className="col-span-2 border border-gray-300 rounded px-3 py-2 text-sm"
          />

          <input
            type="text"
            value={newDeliverable.length || ''}
            onChange={(e) => setNewDeliverable({ ...newDeliverable, length: e.target.value })}
            placeholder="Length (e.g., 8-10 min)"
            className="col-span-3 border border-gray-300 rounded px-3 py-2 text-sm"
          />

          <button
            onClick={addDeliverable}
            disabled={!newDeliverable.type}
            className="col-span-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* USAGE SECTION */}
      <div className="border border-gray-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-gray-600" />
          <h4 className="font-semibold text-gray-900">U — Usage Rights</h4>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Where and for how long they can use your content. Organic is free; paid ads cost extra.
        </p>

        {/* Platforms */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 mb-2 block">
            Platforms & Usage Type
          </label>
          <div className="grid grid-cols-2 gap-2">
            {platformOptions.map((platform) => (
              <label key={platform} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={usagePlatforms.includes(platform)}
                  onChange={() => togglePlatform(platform)}
                  className="rounded border-gray-300"
                />
                <span className="text-gray-700">{platform}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Start Date</label>
            <input
              type="date"
              value={usageStartDate}
              onChange={(e) => onChange('usageStartDate', e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">End Date</label>
            <input
              type="date"
              value={usageEndDate}
              onChange={(e) => onChange('usageEndDate', e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      {/* EXCLUSIVITY SECTION */}
      <div className="border border-gray-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-gray-600" />
          <h4 className="font-semibold text-gray-900">E — Exclusivity</h4>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Renting a category means you won't promote competitors during the exclusivity window.
        </p>

        {exclusivity ? (
          <>
            {/* Competitor List */}
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Competitor List (Be Specific)
              </label>

              {exclusivityCompetitors.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {exclusivityCompetitors.map((competitor, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 bg-red-50 text-red-700 px-2 py-1 rounded text-sm"
                    >
                      {competitor}
                      <button onClick={() => removeCompetitor(index)} className="hover:text-red-900">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCompetitor}
                  onChange={(e) => setNewCompetitor(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCompetitor())}
                  placeholder="e.g., Nike, Adidas, Under Armour"
                  className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
                />
                <button
                  onClick={addCompetitor}
                  disabled={!newCompetitor.trim()}
                  className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Exclusivity Window */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Exclusivity Start
                </label>
                <input
                  type="date"
                  value={exclusivityStartDate}
                  onChange={(e) => onChange('exclusivityStartDate', e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Exclusivity End
                </label>
                <input
                  type="date"
                  value={exclusivityEndDate}
                  onChange={(e) => onChange('exclusivityEndDate', e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
              </div>
            </div>
          </>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-sm text-emerald-700">
            No exclusivity for this deal — you're free to work with competitors.
          </div>
        )}
      </div>
    </div>
  );
}
