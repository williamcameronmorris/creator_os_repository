import React from 'react';
import { MessageSquare, Send, Calculator, TrendingUp } from 'lucide-react';

interface IntentOption {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  action: () => void;
}

interface IntentBasedDashboardProps {
  onSelectIntent: (intent: 'brand-contacted' | 'pitch-brand' | 'explore-rates' | 'track-deals') => void;
}

export default function IntentBasedDashboard({ onSelectIntent }: IntentBasedDashboardProps) {
  const intentOptions: IntentOption[] = [
    {
      id: 'brand-contacted',
      title: 'Brand Contacted Me',
      description: 'Quick pricing calculator and response templates',
      icon: <MessageSquare className="w-7 h-7" />,
      color: 'text-sky-700',
      bgColor: 'card-pastel-sky',
      action: () => onSelectIntent('brand-contacted'),
    },
    {
      id: 'pitch-brand',
      title: 'I Want to Pitch a Brand',
      description: 'Templates and outreach tools to land deals',
      icon: <Send className="w-7 h-7" />,
      color: 'text-emerald-700',
      bgColor: 'card-pastel-emerald',
      action: () => onSelectIntent('pitch-brand'),
    },
    {
      id: 'explore-rates',
      title: 'Just Exploring Rates',
      description: 'See what you should charge for different deals',
      icon: <Calculator className="w-7 h-7" />,
      color: 'text-amber-700',
      bgColor: 'card-pastel-amber',
      action: () => onSelectIntent('explore-rates'),
    },
    {
      id: 'track-deals',
      title: 'Track Existing Deals',
      description: 'Manage your pipeline and follow up on deals',
      icon: <TrendingUp className="w-7 h-7" />,
      color: 'text-purple-700',
      bgColor: 'card-pastel-lavender',
      action: () => onSelectIntent('track-deals'),
    },
  ];

  return (
    <div className="min-h-screen py-16 px-4 bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16 animate-fade-in">
          <h1 className="text-5xl font-bold text-slate-900 mb-4">
            What would you like to do today?
          </h1>
          <p className="text-xl text-slate-600 font-medium">
            Choose an action to get started with your brand deals
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-12">
          {intentOptions.map((option, index) => (
            <button
              key={option.id}
              onClick={option.action}
              className={`card-soft ${option.bgColor} p-10 text-left transition-all-smooth hover:-translate-y-1 animate-scale-in`}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className={`${option.color === 'text-sky-700' ? 'icon-container-sky' : option.color === 'text-emerald-700' ? 'icon-container-emerald' : option.color === 'text-amber-700' ? 'icon-container-amber' : 'icon-container-lavender'} w-14 h-14 rounded-2xl flex items-center justify-center mb-6`}>
                <div className={option.color}>
                  {option.icon}
                </div>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-3">
                {option.title}
              </h2>
              <p className="text-slate-700 text-base font-medium">
                {option.description}
              </p>
            </button>
          ))}
        </div>

        <div className="text-center">
          <div className="card-soft inline-block px-8 py-4">
            <p className="text-slate-600 font-medium">
              Not sure where to start? Try <span className="text-sky-700 font-bold">"Brand Contacted Me"</span> for quick pricing help
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}