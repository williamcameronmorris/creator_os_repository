import { AlertCircle, CheckCircle, XCircle } from 'lucide-react';

interface Deal {
  due_completeness_score: number;
  due_missing_fields: string[];
  scope_locked: boolean;
  scope_recap_sent: boolean;
}

interface DueCompletenessWidgetProps {
  deal: Deal;
  onLockScope?: () => void;
}

export default function DueCompletenessWidget({ deal, onLockScope }: DueCompletenessWidgetProps) {
  const getStatusColor = (score: number) => {
    if (score >= 100) return 'bg-emerald-50 border-emerald-200';
    if (score >= 70) return 'bg-amber-50 border-amber-200';
    return 'bg-red-50 border-red-200';
  };

  const getStatusIcon = (score: number) => {
    if (score >= 100) return <CheckCircle className="w-5 h-5 text-emerald-600" />;
    if (score >= 70) return <AlertCircle className="w-5 h-5 text-amber-600" />;
    return <XCircle className="w-5 h-5 text-red-600" />;
  };

  const getStatusText = (score: number) => {
    if (score >= 100) return 'Ready to Lock Scope';
    if (score >= 70) return 'Almost Complete';
    return 'Incomplete - High Risk';
  };

  const getAdvice = (score: number) => {
    if (score >= 100) {
      return 'All DUE elements are defined. Lock this scope and send the recap to the brand before starting work.';
    }
    if (score >= 70) {
      return 'Most elements are defined, but clarify the missing items before filming to avoid scope creep.';
    }
    return 'Critical information is missing. If you start work now, you risk doing extra deliverables for free.';
  };

  return (
    <div className={`border rounded-lg p-4 ${getStatusColor(deal.due_completeness_score)}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {getStatusIcon(deal.due_completeness_score)}
          <div>
            <h3 className="font-semibold text-sm text-gray-900">
              DUE Completeness: {deal.due_completeness_score}%
            </h3>
            <p className="text-xs text-gray-600 mt-0.5">
              {getStatusText(deal.due_completeness_score)}
            </p>
          </div>
        </div>

        {deal.scope_locked && (
          <div className="flex items-center gap-1.5 bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-medium">
            <CheckCircle className="w-3.5 h-3.5" />
            Scope Locked
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
        <div
          className={`h-2 rounded-full transition-all ${
            deal.due_completeness_score >= 100
              ? 'bg-emerald-600'
              : deal.due_completeness_score >= 70
              ? 'bg-amber-500'
              : 'bg-red-500'
          }`}
          style={{ width: `${deal.due_completeness_score}%` }}
        />
      </div>

      {/* Advice */}
      <p className="text-sm text-gray-700 mb-3">
        {getAdvice(deal.due_completeness_score)}
      </p>

      {/* Missing Fields */}
      {deal.due_missing_fields && deal.due_missing_fields.length > 0 && (
        <div className="bg-white rounded p-3 mb-3">
          <p className="text-xs font-semibold text-gray-700 mb-2">Missing Information:</p>
          <ul className="space-y-1">
            {deal.due_missing_fields.map((field, index) => (
              <li key={index} className="flex items-start gap-2 text-xs text-gray-600">
                <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                <span>{field}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        {deal.due_completeness_score >= 100 && !deal.scope_locked && onLockScope && (
          <button
            onClick={onLockScope}
            className="flex-1 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            Lock Scope & Send Recap
          </button>
        )}

        {deal.due_completeness_score < 100 && (
          <div className="flex-1 bg-gray-100 text-gray-500 px-4 py-2 rounded-lg text-sm font-medium text-center cursor-not-allowed">
            Complete DUE fields to lock scope
          </div>
        )}
      </div>

      {/* The Golden Rule */}
      {!deal.scope_locked && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-xs font-semibold text-gray-700 mb-1">The Rule:</p>
          <p className="text-xs text-gray-600 italic">
            "If it's not in the scope, it's a new line item. Never start filming until scope is locked."
          </p>
        </div>
      )}

      {/* Scope Recap Status */}
      {deal.scope_locked && !deal.scope_recap_sent && (
        <div className="mt-3 pt-3 border-t border-emerald-200">
          <p className="text-xs text-amber-700 font-medium">
            ⚠️ Send the scope recap email to the brand before filming
          </p>
        </div>
      )}

      {deal.scope_locked && deal.scope_recap_sent && (
        <div className="mt-3 pt-3 border-t border-emerald-200">
          <p className="text-xs text-emerald-700 font-medium">
            ✓ Scope locked and recap sent. Safe to begin production.
          </p>
        </div>
      )}
    </div>
  );
}
