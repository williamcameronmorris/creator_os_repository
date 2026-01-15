import { useNavigate } from 'react-router-dom';
import { TrendingUp, BarChart3, Eye, ArrowRight, Sparkles } from 'lucide-react';

export function AnalyticsCTABanner() {
  const navigate = useNavigate();

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 p-8 shadow-2xl">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30"></div>

      <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-fuchsia-400/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>

      <div className="relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-8">
          <div className="flex-1 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-full text-white text-sm font-medium mb-4">
              <Sparkles className="w-4 h-4" />
              Unlock Insights
            </div>

            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-3 leading-tight">
              Ready to analyze your content?
            </h2>

            <p className="text-lg text-white/90 mb-6 max-w-2xl">
              Discover what's working, track your growth, and make data-driven decisions to boost engagement across all your platforms.
            </p>

            <div className="flex flex-wrap items-center gap-6 mb-6">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <div className="text-left">
                  <div className="text-sm text-white/80">Track</div>
                  <div className="text-white font-semibold">Growth Metrics</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg">
                  <BarChart3 className="w-5 h-5 text-white" />
                </div>
                <div className="text-left">
                  <div className="text-sm text-white/80">Analyze</div>
                  <div className="text-white font-semibold">Performance</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg">
                  <Eye className="w-5 h-5 text-white" />
                </div>
                <div className="text-left">
                  <div className="text-sm text-white/80">Monitor</div>
                  <div className="text-white font-semibold">Engagement</div>
                </div>
              </div>
            </div>

            <button
              onClick={() => navigate('/analytics')}
              className="group inline-flex items-center gap-3 px-8 py-4 bg-white text-violet-600 rounded-xl font-semibold text-lg hover:bg-white/95 hover:scale-105 transition-all duration-200 shadow-xl hover:shadow-2xl"
            >
              View Analytics Dashboard
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          <div className="hidden lg:block">
            <div className="relative w-48 h-48">
              <div className="absolute inset-0 bg-white/10 backdrop-blur-sm rounded-2xl rotate-6 animate-pulse"></div>
              <div className="absolute inset-0 bg-white/20 backdrop-blur-sm rounded-2xl -rotate-6"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative">
                  <div className="absolute inset-0 bg-white rounded-full blur-xl opacity-50"></div>
                  <div className="relative flex items-center justify-center w-32 h-32 bg-gradient-to-br from-white to-white/80 rounded-full shadow-2xl">
                    <BarChart3 className="w-16 h-16 text-violet-600" />
                  </div>
                </div>
              </div>

              <div className="absolute -top-4 -right-4 flex items-center justify-center w-12 h-12 bg-fuchsia-500 rounded-full shadow-lg animate-bounce">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>

              <div className="absolute -bottom-2 -left-2 flex items-center justify-center w-10 h-10 bg-yellow-400 rounded-full shadow-lg animate-pulse">
                <Sparkles className="w-5 h-5 text-yellow-900" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
