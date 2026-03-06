import React, { useState } from 'react';
import { BarChart3, Copy, CheckCircle, Lightbulb, ArrowRight } from 'lucide-react';

const ReportGenerator = () => {
  const [copied, setCopied] = useState(false);

  // State matches Slide 12 & 13 requirements
  const [data, setData] = useState({
    brandName: '',
    objective: 'Awareness', // Default to 'A'
    postLinks: '',
    // Metrics
    views: '',
    engagement: '', // for Awareness [cite: 177]
    clicks: '',     // for Conversion [cite: 182]
    sales: '',
    // The "Money Section"
    nextIdea1: '',
    nextIdea2: '',
  });

  const generateReport = () => {
    // Dynamic metrics section based on ARC Framework [cite: 177, 182]
    let metricsSection = '';
    if (data.objective === 'Awareness') {
      metricsSection = `PERFORMANCE (Objective: Awareness)
• Total Views: ${data.views || '[Number]'}
• Engagement Rate: ${data.engagement || '[Number]%'}
• Audience Sentiment: Positive (See screenshots attached)`;
    } else if (data.objective === 'Conversion') {
      metricsSection = `PERFORMANCE (Objective: Conversion)
• Link Clicks: ${data.clicks || '[Number]'}
• CTR: [Calculated %]
• Sales/Conversions: ${data.sales || '[Number]'}`;
    } else {
      metricsSection = `PERFORMANCE (Objective: Repurposing)
• Assets Delivered: HQ Video Files + Raw Footage
• Usage Status: Licensed for ${data.objective} use
• Quality Check: Approved`;
    }

    return `POST-CAMPAIGN REPORT: ${data.brandName || '[Brand]'} × [Your Name]

1. WHAT WE DELIVERED
${data.postLinks || '• [Link to Post 1]\n• [Link to Post 2]'}

2. ${metricsSection}

3. AUDIENCE FEEDBACK
• "Quotes from comments..."
• (See attached screenshots for full sentiment analysis)

4. NEXT CAMPAIGN IDEAS (The Sequel)
Based on how the audience reacted, I see two clear opportunities for our next sprint:

Option 1: ${data.nextIdea1 || '[E.g. Seasonal Series]'}
Option 2: ${data.nextIdea2 || '[E.g. Product Launch Integration]'}

Shall I send over a quick scope/pricing for Option 1?`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateReport());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6 border-b pb-4">
        <div className="bg-purple-100 p-2 rounded-lg text-purple-600">
          <BarChart3 size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">The "Re-Hire" Report</h2>
          <p className="text-sm text-gray-500">Turn a one-off deal into a pipeline [Slide 12]</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

        {/* Left Column: Inputs */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Campaign Info</label>
            <input
              className="w-full p-2 border rounded text-sm mb-2"
              placeholder="Brand Name"
              onChange={(e) => setData({...data, brandName: e.target.value})}
            />
            <select
              className="w-full p-2 border rounded text-sm"
              onChange={(e) => setData({...data, objective: e.target.value})}
            >
              <option value="Awareness">Objective: Awareness (Views)</option>
              <option value="Conversion">Objective: Conversion (Sales)</option>
              <option value="Repurposing">Objective: Repurposing (Assets)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Key Metrics</label>
            {data.objective === 'Awareness' ? (
              <div className="grid grid-cols-2 gap-2">
                <input className="p-2 border rounded text-sm" placeholder="Total Views" onChange={(e) => setData({...data, views: e.target.value})}/>
                <input className="p-2 border rounded text-sm" placeholder="Eng. Rate %" onChange={(e) => setData({...data, engagement: e.target.value})}/>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <input className="p-2 border rounded text-sm" placeholder="Link Clicks" onChange={(e) => setData({...data, clicks: e.target.value})}/>
                <input className="p-2 border rounded text-sm" placeholder="Total Sales" onChange={(e) => setData({...data, sales: e.target.value})}/>
              </div>
            )}
          </div>

          <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100">
            <label className="block text-xs font-bold uppercase text-yellow-800 mb-1 flex items-center gap-1">
              <Lightbulb size={12} /> The Money Section
            </label>
            <p className="text-xs text-yellow-700 mb-2">"Brands don't want you to just perform. They want you to think with them." [Slide 12]</p>
            <input
              className="w-full p-2 border border-yellow-200 rounded text-sm mb-2"
              placeholder="Idea 1 (e.g. Holiday Series)"
              onChange={(e) => setData({...data, nextIdea1: e.target.value})}
            />
            <input
              className="w-full p-2 border border-yellow-200 rounded text-sm"
              placeholder="Idea 2 (e.g. Whitelisting)"
              onChange={(e) => setData({...data, nextIdea2: e.target.value})}
            />
          </div>
        </div>

        {/* Right Column: Preview */}
        <div className="relative">
          <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Email Preview</label>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 h-full text-sm whitespace-pre-wrap font-mono text-gray-700">
            {generateReport()}
          </div>
          <button
            onClick={handleCopy}
            className="absolute top-8 right-2 flex items-center gap-2 bg-white px-3 py-1.5 rounded shadow-sm border text-xs font-medium hover:bg-gray-50 text-purple-600"
          >
            {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 p-2 rounded">
        <ArrowRight size={14} />
        <span>Use this report to pitch the "Renewal" script found in Slide 13.</span>
      </div>
    </div>
  );
};

export default ReportGenerator;