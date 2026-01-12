import React, { useState } from 'react';
import { DollarSign, ShieldAlert, Copy, CheckCircle } from 'lucide-react';

const FinancialTools = () => {
  const [activeTab, setActiveTab] = useState('invoice');
  const [copied, setCopied] = useState(false);

  // Invoice State (Slide 8)
  const [invoice, setInvoice] = useState({
    invNumber: 'INV-2024-001',
    brandName: '',
    price: '',
    items: '',
    dueDate: '',
    poNumber: ''
  });

  // Approval Policy State (Slide 9)
  const [policy, setPolicy] = useState({
    rounds: '1',
    hourlyRate: '$250'
  });

  const generateInvoiceEmail = () => {
    return `Hi [Name],

Please find attached invoice #${invoice.invNumber} for the ${invoice.brandName} campaign.

SUMMARY
• Amount Due: $${invoice.price}
• Due Date: ${invoice.dueDate}
• PO Number: ${invoice.poNumber || 'N/A'}

ITEMIZATION
${invoice.items || '• [Deliverables List]'}

PAYMENT METHODS
• ACH/Wire: [Your Bank Details]
• Stripe/PayPal: [Your Link]

Thank you!`;
  };

  const generatePolicyText = () => {
    return `APPROVALS & REVISIONS POLICY

To ensure we hit our Publish Date of [Date], here is our approval protocol:

1. Consolidated Feedback: Please gather all stakeholder feedback into ONE consolidated list.
2. Included Revisions: This project includes ${policy.rounds} round(s) of revisions.
3. Definition of a "Round": One round equals one list of changes sent at one time.
4. Out of Scope: Re-shoots due to change of direction or creative brief changes are billable at ${policy.hourlyRate}/hr.

Please confirm this works for your team.`;
  };

  const textToCopy = activeTab === 'invoice' ? generateInvoiceEmail() : generatePolicyText();

  const handleCopy = () => {
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 max-w-2xl mx-auto mt-6">

      {/* Tabs */}
      <div className="flex gap-4 border-b mb-6">
        <button
          onClick={() => setActiveTab('invoice')}
          className={`pb-2 text-sm font-bold flex items-center gap-2 ${activeTab === 'invoice' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
        >
          <DollarSign size={16} /> Invoice Email [Slide 8]
        </button>
        <button
          onClick={() => setActiveTab('policy')}
          className={`pb-2 text-sm font-bold flex items-center gap-2 ${activeTab === 'policy' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
        >
          <ShieldAlert size={16} /> Approval Policy [Slide 9]
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* INPUTS */}
        <div className="space-y-4">
          {activeTab === 'invoice' ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <input className="p-2 border rounded text-sm" placeholder="INV-001" onChange={e => setInvoice({...invoice, invNumber: e.target.value})} />
                <input className="p-2 border rounded text-sm" placeholder="PO Number" onChange={e => setInvoice({...invoice, poNumber: e.target.value})} />
              </div>
              <input className="w-full p-2 border rounded text-sm" placeholder="Brand Name" onChange={e => setInvoice({...invoice, brandName: e.target.value})} />
              <div className="grid grid-cols-2 gap-2">
                <input className="p-2 border rounded text-sm" placeholder="Total Amount" onChange={e => setInvoice({...invoice, price: e.target.value})} />
                <input type="date" className="p-2 border rounded text-sm" onChange={e => setInvoice({...invoice, dueDate: e.target.value})} />
              </div>
              <textarea className="w-full p-2 border rounded text-sm" placeholder="Itemized list (e.g. 1x Reel, Usage Rights)" rows={3} onChange={e => setInvoice({...invoice, items: e.target.value})} />
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Included Revision Rounds</label>
                <select className="w-full p-2 border rounded text-sm" onChange={e => setPolicy({...policy, rounds: e.target.value})}>
                  <option value="1">1 Round (Standard)</option>
                  <option value="2">2 Rounds</option>
                  <option value="0">0 Rounds (Strict)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Hourly Rate for Overage</label>
                <input className="w-full p-2 border rounded text-sm" placeholder="$250" onChange={e => setPolicy({...policy, hourlyRate: e.target.value})} />
              </div>
              <div className="bg-orange-50 p-3 rounded text-xs text-orange-800">
                <strong>Why this matters:</strong> "The sloppiness of approvals destroys creators." This text sets boundaries upfront.
              </div>
            </>
          )}
        </div>

        {/* PREVIEW */}
        <div className="relative">
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 h-full text-sm whitespace-pre-wrap font-mono text-gray-700">
            {textToCopy}
          </div>
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 flex items-center gap-2 bg-white px-3 py-1.5 rounded shadow-sm border text-xs font-medium hover:bg-gray-50 text-blue-600"
          >
            {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FinancialTools;
