import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { FileText, Save, CheckCircle, AlertCircle } from 'lucide-react';

interface DealContractProps {
  dealId: string;
}

interface ContractData {
  id?: string;
  contract_status: string;
  contract_file_url: string;
  contract_version: string;
  rights_summary: string;
  organic_only: boolean;
  paid_usage_allowed: boolean;
  full_digital_rights: boolean;
  whitelisting_allowed: boolean;
  revision_rounds: number;
  exclusivity_active: boolean;
}

export function DealContract({ dealId }: DealContractProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contract, setContract] = useState<ContractData>({
    contract_status: 'draft',
    contract_file_url: '',
    contract_version: 'v1',
    rights_summary: '',
    organic_only: true,
    paid_usage_allowed: false,
    full_digital_rights: false,
    whitelisting_allowed: false,
    revision_rounds: 1,
    exclusivity_active: false,
  });

  useEffect(() => {
    if (dealId && user) {
      loadContract();
    }
  }, [dealId, user]);

  useEffect(() => {
    generateRightsSummary();
  }, [
    contract.organic_only,
    contract.paid_usage_allowed,
    contract.full_digital_rights,
    contract.whitelisting_allowed,
    contract.exclusivity_active,
    contract.revision_rounds,
  ]);

  const loadContract = async () => {
    try {
      const { data, error } = await supabase
        .from('deal_contracts')
        .select('*')
        .eq('deal_id', dealId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setContract(data);
      }
    } catch (error) {
      console.error('Error loading contract:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateRightsSummary = () => {
    let summary = '';

    if (contract.organic_only) {
      summary += 'Organic posts only. ';
    }

    if (contract.paid_usage_allowed) {
      summary += 'Brand can use as paid ads. ';
    }

    if (contract.full_digital_rights) {
      summary += 'Full digital usage rights granted. ';
    }

    if (contract.whitelisting_allowed) {
      summary += 'Whitelisting allowed through creator account. ';
    } else {
      summary += 'No whitelisting. ';
    }

    if (contract.exclusivity_active) {
      summary += 'Exclusivity clause active. ';
    } else {
      summary += 'No exclusivity. ';
    }

    summary += `${contract.revision_rounds} revision round${contract.revision_rounds !== 1 ? 's' : ''} included.`;

    setContract(prev => ({ ...prev, rights_summary: summary }));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    try {
      const dataToSave = {
        deal_id: dealId,
        user_id: user.id,
        ...contract,
      };

      if (contract.id) {
        const { error } = await supabase
          .from('deal_contracts')
          .update(dataToSave)
          .eq('id', contract.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('deal_contracts')
          .insert(dataToSave)
          .select()
          .single();

        if (error) throw error;
        if (data) setContract(data);
      }

      await supabase
        .from('deals')
        .update({ contract_status: contract.contract_status })
        .eq('id', dealId);

    } catch (error) {
      console.error('Error saving contract:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-foreground mb-1">Contract & Rights</h3>
        <p className="text-sm text-muted-foreground">Track contract status and usage rights</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            Contract Status
          </label>
          <select
            value={contract.contract_status}
            onChange={(e) => setContract(prev => ({ ...prev, contract_status: e.target.value }))}
            className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="draft">Draft</option>
            <option value="sent">Sent to Brand</option>
            <option value="signed">Signed by Both Parties</option>
            <option value="executed">Fully Executed</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            Contract File URL
          </label>
          <input
            type="url"
            value={contract.contract_file_url}
            onChange={(e) => setContract(prev => ({ ...prev, contract_file_url: e.target.value }))}
            placeholder="https://example.com/contract.pdf"
            className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <p className="text-xs text-muted-foreground mt-1">Link to PDF, DocuSign, or HelloSign</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            Contract Version
          </label>
          <input
            type="text"
            value={contract.contract_version}
            onChange={(e) => setContract(prev => ({ ...prev, contract_version: e.target.value }))}
            placeholder="v1"
            className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <h4 className="text-base font-bold text-foreground mb-4">Usage Rights</h4>

        <div className="space-y-3">
          <label className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border cursor-pointer hover:border-primary/50 transition-all">
            <input
              type="checkbox"
              checked={contract.organic_only}
              onChange={(e) => setContract(prev => ({ ...prev, organic_only: e.target.checked }))}
              className="w-5 h-5 rounded border-2 border-border text-primary focus:ring-2 focus:ring-primary/50 mt-0.5"
            />
            <div>
              <div className="font-semibold text-foreground">Organic Only</div>
              <div className="text-sm text-muted-foreground">Content limited to organic posts</div>
            </div>
          </label>

          <label className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border cursor-pointer hover:border-primary/50 transition-all">
            <input
              type="checkbox"
              checked={contract.paid_usage_allowed}
              onChange={(e) => setContract(prev => ({ ...prev, paid_usage_allowed: e.target.checked }))}
              className="w-5 h-5 rounded border-2 border-border text-primary focus:ring-2 focus:ring-primary/50 mt-0.5"
            />
            <div>
              <div className="font-semibold text-foreground">Paid Usage Allowed</div>
              <div className="text-sm text-muted-foreground">Brand can run content as paid ads</div>
            </div>
          </label>

          <label className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border cursor-pointer hover:border-primary/50 transition-all">
            <input
              type="checkbox"
              checked={contract.full_digital_rights}
              onChange={(e) => setContract(prev => ({ ...prev, full_digital_rights: e.target.checked }))}
              className="w-5 h-5 rounded border-2 border-border text-primary focus:ring-2 focus:ring-primary/50 mt-0.5"
            />
            <div>
              <div className="font-semibold text-foreground">Full Digital Rights</div>
              <div className="text-sm text-muted-foreground">Complete digital usage rights granted</div>
            </div>
          </label>

          <label className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border cursor-pointer hover:border-primary/50 transition-all">
            <input
              type="checkbox"
              checked={contract.whitelisting_allowed}
              onChange={(e) => setContract(prev => ({ ...prev, whitelisting_allowed: e.target.checked }))}
              className="w-5 h-5 rounded border-2 border-border text-primary focus:ring-2 focus:ring-primary/50 mt-0.5"
            />
            <div>
              <div className="font-semibold text-foreground">Whitelisting Allowed</div>
              <div className="text-sm text-muted-foreground">Brand can run ads through your account</div>
            </div>
          </label>

          <label className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border cursor-pointer hover:border-primary/50 transition-all">
            <input
              type="checkbox"
              checked={contract.exclusivity_active}
              onChange={(e) => setContract(prev => ({ ...prev, exclusivity_active: e.target.checked }))}
              className="w-5 h-5 rounded border-2 border-border text-primary focus:ring-2 focus:ring-primary/50 mt-0.5"
            />
            <div>
              <div className="font-semibold text-foreground">Exclusivity Clause</div>
              <div className="text-sm text-muted-foreground">Exclusivity agreement with brand</div>
            </div>
          </label>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-semibold text-foreground mb-2">
            Revision Rounds Included
          </label>
          <input
            type="number"
            min="0"
            max="10"
            value={contract.revision_rounds}
            onChange={(e) => setContract(prev => ({ ...prev, revision_rounds: parseInt(e.target.value) || 0 }))}
            className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      <div className="p-4 rounded-xl bg-muted/30 border border-border">
        <div className="flex items-start gap-3 mb-2">
          <FileText className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-foreground mb-1">Rights Summary (Plain English)</div>
            <div className="text-sm text-foreground">{contract.rights_summary || 'Configure rights above to generate summary'}</div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {contract.contract_status === 'signed' || contract.contract_status === 'executed' ? (
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm font-semibold">Contract Finalized - Scope Locked</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm font-semibold">Contract In Progress</span>
          </div>
        )}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Save className="w-5 h-5" />
        {saving ? 'Saving...' : 'Save Contract'}
      </button>
    </div>
  );
}
