import { useNavigate } from 'react-router-dom';
import { DollarSign, Briefcase, BarChart3, ArrowRight } from 'lucide-react';

export function GrowSectionCards() {
  const navigate = useNavigate();

  const cards = [
    {
      title: 'Revenue',
      description: 'Track income from all sources',
      icon: DollarSign,
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      gradient: 'from-emerald-500/20 to-emerald-600/5',
      path: '/revenue',
    },
    {
      title: 'Partnerships',
      description: 'Manage brand collaborations',
      icon: Briefcase,
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-600 dark:text-blue-400',
      gradient: 'from-blue-500/20 to-blue-600/5',
      path: '/pipeline',
    },
    {
      title: 'Social Analytics',
      description: 'Detailed platform insights',
      icon: BarChart3,
      iconBg: 'bg-violet-500/10',
      iconColor: 'text-violet-600 dark:text-violet-400',
      gradient: 'from-violet-500/20 to-violet-600/5',
      path: '/analytics',
    },
  ];

  return (
    <div className="mt-12">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground mb-2">Grow Your Business</h2>
        <p className="text-muted-foreground">
          Explore tools to maximize your creator revenue
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.title}
              onClick={() => navigate(card.path)}
              className="group relative overflow-hidden p-6 rounded-2xl border-2 border-border bg-card hover:border-primary/50 transition-all text-left hover:shadow-lg"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 group-hover:opacity-100 transition-opacity`}></div>

              <div className="relative z-10">
                <div className={`${card.iconBg} w-14 h-14 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110`}>
                  <Icon className={`w-7 h-7 ${card.iconColor}`} />
                </div>

                <h3 className="text-xl font-bold text-foreground mb-2 flex items-center gap-2">
                  {card.title}
                  <ArrowRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" />
                </h3>

                <p className="text-sm text-muted-foreground">
                  {card.description}
                </p>
              </div>

              <div className="absolute bottom-0 right-0 w-32 h-32 bg-gradient-to-tl from-primary/5 to-transparent rounded-tl-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
