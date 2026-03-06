import { useNavigate } from 'react-router-dom';
import { Video, BarChart3, ArrowRight, Calendar } from 'lucide-react';

export function GrowSectionCards() {
  const navigate = useNavigate();

  const cards = [
    {
      title: 'Content Studio',
      description: 'Create and manage content',
      icon: Video,
      iconBg: 'bg-sky-500/10',
      iconColor: 'text-sky-600',
      gradient: 'from-sky-500/20 to-sky-600/5',
      path: '/studio',
    },
    {
      title: 'Schedule',
      description: 'Plan your content calendar',
      icon: Calendar,
      iconBg: 'bg-rose-500/10',
      iconColor: 'text-rose-600',
      gradient: 'from-rose-500/20 to-rose-600/5',
      path: '/schedule',
    },
    {
      title: 'Analytics',
      description: 'Track audience growth',
      icon: BarChart3,
      iconBg: 'bg-teal-500/10',
      iconColor: 'text-teal-600',
      gradient: 'from-teal-500/20 to-teal-600/5',
      path: '/analytics',
    },
  ];

  return (
    <div className="mt-12">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground mb-2">Grow Your Audience</h2>
        <p className="text-muted-foreground">
          Tools to help you create and share content
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.title}
              onClick={() => navigate(card.path)}
              className="group relative overflow-hidden p-4 rounded-xl border-2 border-border bg-card hover:border-primary/50 transition-all text-left hover:shadow-lg"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 group-hover:opacity-100 transition-opacity`}></div>

              <div className="relative z-10">
                <div className={`${card.iconBg} w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110`}>
                  <Icon className={`w-6 h-6 ${card.iconColor}`} />
                </div>

                <h3 className="text-lg font-bold text-foreground mb-2 flex items-center gap-2">
                  {card.title}
                  <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" />
                </h3>

                <p className="text-xs text-muted-foreground">
                  {card.description}
                </p>
              </div>

              <div className="absolute bottom-0 right-0 w-24 h-24 bg-gradient-to-tl from-primary/5 to-transparent rounded-tl-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
