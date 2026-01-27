import { useState } from 'react';
import { Target, TrendingUp, Users, DollarSign, Sparkles, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface BrandFitCheckProps {
  brandName: string;
  industry?: string;
  onComplete?: (fitScore: number, analysis: any) => void;
}

interface FitAnalysis {
  score: number;
  strengths: string[];
  concerns: string[];
  recommendations: string[];
  audienceMatch: number;
  contentStyleMatch: number;
  budgetExpectation: string;
}

export default function BrandFitCheck({ brandName, industry, onComplete }: BrandFitCheckProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [analysis, setAnalysis] = useState<FitAnalysis | null>(null);

  const checkFit = async () => {
    setIsChecking(true);

    // Simulate AI analysis (in production, this would call an AI service)
    await new Promise(resolve => setTimeout(resolve, 2000));

    const mockAnalysis: FitAnalysis = {
      score: Math.floor(Math.random() * 30) + 70, // 70-100 range for demo
      strengths: [
        'Brand values align with your audience demographics',
        'Previous campaigns show authentic storytelling',
        'Active in creator partnerships with fair compensation',
        'Strong engagement on similar influencer content'
      ],
      concerns: [
        'May have strict content guidelines',
        'Longer contract review timeline than average',
      ],
      recommendations: [
        'Highlight your engagement rate in first pitch',
        'Reference their recent campaign with @similarcreator',
        'Propose a product review + tutorial format',
        'Suggest 3-month trial partnership before long-term commitment'
      ],
      audienceMatch: 85,
      contentStyleMatch: 92,
      budgetExpectation: 'Medium to Large ($2,000 - $8,000 per campaign)'
    };

    setAnalysis(mockAnalysis);
    setIsChecking(false);

    if (onComplete) {
      onComplete(mockAnalysis.score, mockAnalysis);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-rose-600';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Great Fit';
    if (score >= 60) return 'Good Fit';
    return 'Needs Review';
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 rounded-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Brand Fit Assessment</h3>
            <p className="text-sm text-slate-600">
              AI-powered analysis to help you decide if {brandName} is right for you
            </p>
          </div>
          <Target className="w-8 h-8 text-slate-400" />
        </div>

        {!analysis && !isChecking && (
          <button
            onClick={checkFit}
            className="w-full bg-slate-900 text-white px-6 py-3 rounded-lg hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles className="w-5 h-5" />
            Analyze Brand Fit
          </button>
        )}

        {isChecking && (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mb-4"></div>
            <p className="text-slate-600">Analyzing brand compatibility...</p>
          </div>
        )}

        {analysis && (
          <div className="space-y-6">
            {/* Overall Score */}
            <div className="bg-white rounded-lg p-6 border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-600">Overall Fit Score</span>
                <span className="text-sm font-medium text-slate-500">{getScoreLabel(analysis.score)}</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${
                      analysis.score >= 80 ? 'bg-emerald-500' :
                      analysis.score >= 60 ? 'bg-amber-500' :
                      'bg-rose-500'
                    }`}
                    style={{ width: `${analysis.score}%` }}
                  />
                </div>
                <span className={`text-3xl font-bold ${getScoreColor(analysis.score)}`}>
                  {analysis.score}
                </span>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-lg p-4 border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-medium text-slate-600">Audience Match</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{analysis.audienceMatch}%</div>
              </div>

              <div className="bg-white rounded-lg p-4 border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-medium text-slate-600">Content Style</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{analysis.contentStyleMatch}%</div>
              </div>
            </div>

            {/* Budget Expectation */}
            <div className="bg-white rounded-lg p-4 border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-medium text-slate-600">Expected Budget Range</span>
              </div>
              <div className="text-base font-semibold text-slate-900">{analysis.budgetExpectation}</div>
            </div>

            {/* Strengths */}
            <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <h4 className="font-semibold text-emerald-900">Strengths</h4>
              </div>
              <ul className="space-y-2">
                {analysis.strengths.map((strength, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-emerald-800">
                    <span className="text-emerald-500 mt-0.5">•</span>
                    <span>{strength}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Concerns */}
            {analysis.concerns.length > 0 && (
              <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <h4 className="font-semibold text-amber-900">Things to Consider</h4>
                </div>
                <ul className="space-y-2">
                  {analysis.concerns.map((concern, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-amber-800">
                      <span className="text-amber-500 mt-0.5">•</span>
                      <span>{concern}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendations */}
            <div className="bg-sky-50 rounded-lg p-4 border border-sky-200">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-sky-600" />
                <h4 className="font-semibold text-sky-900">Pitch Recommendations</h4>
              </div>
              <ul className="space-y-2">
                {analysis.recommendations.map((rec, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-sky-800">
                    <span className="text-sky-500 mt-0.5">{idx + 1}.</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Action Button */}
            <button
              onClick={checkFit}
              className="w-full bg-slate-900 text-white px-6 py-3 rounded-lg hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <Sparkles className="w-4 h-4" />
              Re-analyze Brand Fit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
