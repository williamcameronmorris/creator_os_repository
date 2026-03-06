import React, { useState } from 'react';
import { Copy, CheckCircle, AlertTriangle } from 'lucide-react';

const ScopeRecapGenerator = () => {
  const [copied, setCopied] = useState(false);
  const [data, setData] = useState({
    brandName: '',
    deliverables: '',
    draftDate: '',
    liveDate: '',
    usageDuration: '30 Days',
    usageType: 'Organic Only',
    exclusivity: 'None',
  });

  const generateEmail = () => {
    return `Hi ${data.brandName || '[Name]'},

Thanks for the chat! To keep things clean and ensure we hit your timeline, here is the scope recap based on our discussion:

DELIVERABLES (The Work)
• ${data.deliverables || '[List Deliverables Here]'}

TIMELINE (The Schedule)
• First Draft: ${data.draftDate || '[Date]'}
• Feedback Due: Within 48 hours of receipt
• Target Go-Live: ${data.liveDate || '[Date]'}

LICENSING (The Usage)
• Usage: ${data.usageType}
• Term: ${data.usageDuration}
• Exclusivity: ${data.exclusivity}

Please reply with "Approved" if this matches your understanding, and I'll send over the agreement/invoice so we can lock this in.

(Note: Any requests outside this scope—like extra edits, raw footage, or whitelisting—will be treated as a new line item.)`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateEmail());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-8 rounded-xl bg-card border border-border">
      <div className="flex items-center gap-3 mb-8 pb-6 border-b border-border">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-primary/10">
          <CheckCircle className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-foreground">Scope Lock Generator</h2>
          <p className="text-sm text-muted-foreground mt-1 font-medium">Prevent scope creep before you start</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="col-span-2">
          <label className="block text-xs font-bold text-foreground uppercase mb-2 tracking-wide">Brand Name</label>
          <input
            type="text"
            className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="e.g. Nike"
            value={data.brandName}
            onChange={(e) => setData({ ...data, brandName: e.target.value })}
          />
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-bold text-foreground uppercase mb-2 tracking-wide">Deliverables</label>
          <input
            type="text"
            className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="e.g. 1x IG Reel, 3x Stories"
            value={data.deliverables}
            onChange={(e) => setData({ ...data, deliverables: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-foreground uppercase mb-2 tracking-wide">Usage Rights</label>
          <select
            className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            value={data.usageType}
            onChange={(e) => setData({ ...data, usageType: e.target.value })}
          >
            <option>Organic Posting Only</option>
            <option>Paid Ads (Whitelisting)</option>
            <option>Digital Rights (Website + Social)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-foreground uppercase mb-2 tracking-wide">Usage Duration</label>
          <input
            type="text"
            className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="e.g. 30 Days"
            value={data.usageDuration}
            onChange={(e) => setData({ ...data, usageDuration: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-foreground uppercase mb-2 tracking-wide">Draft Due Date</label>
          <input
            type="date"
            className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            value={data.draftDate}
            onChange={(e) => setData({ ...data, draftDate: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-foreground uppercase mb-2 tracking-wide">Live Date</label>
          <input
            type="date"
            className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            value={data.liveDate}
            onChange={(e) => setData({ ...data, liveDate: e.target.value })}
          />
        </div>
      </div>

      <div className="bg-muted/50 p-6 rounded-2xl border-2 border-border relative group">
        <pre className="whitespace-pre-wrap font-sans text-sm text-foreground leading-relaxed pr-24">
          {generateEmail()}
        </pre>

        <button
          onClick={handleCopy}
          className="absolute top-4 right-4 flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 text-sm px-4 py-2 rounded-xl font-semibold transition-colors"
        >
          {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied!' : 'Copy Email'}
        </button>
      </div>

      <div className="mt-6 flex items-start gap-3 bg-chart-5/10 border-2 border-chart-5/20 p-4 rounded-2xl">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-chart-5/20">
          <AlertTriangle className="w-4 h-4 text-chart-5" />
        </div>
        <div className="text-sm">
          <p className="font-bold text-chart-5 mb-1">Pro Tip</p>
          <p className="text-muted-foreground">
            "If it's not in the scope, it's a new line item." Send this email{' '}
            <span className="font-semibold">before</span> you sign the contract or film anything.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ScopeRecapGenerator;
