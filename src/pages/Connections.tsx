import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PostForMeConnections } from '../components/PostForMeConnections';

export function Connections() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const justConnected = searchParams.get('connected');
  const initialFlash = justConnected ? `Connected ${justConnected.toUpperCase()}.` : null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <div className="t-micro mb-2">
        <span className="text-foreground">04</span>
        <span className="mx-2 text-muted-foreground">/</span>
        <span>CONNECTIONS</span>
      </div>
      <h1
        className="text-foreground mb-12"
        style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.05 }}
      >
        Where you{' '}
        <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>publish.</em>
      </h1>

      <button
        onClick={() => navigate('/office')}
        className="t-micro mb-8 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
      >
        <ArrowRight className="w-3 h-3" style={{ transform: 'rotate(180deg)' }} />
        Back to Office
      </button>

      <PostForMeConnections initialFlash={initialFlash} />
    </div>
  );
}
