import { useNavigate } from 'react-router-dom';
import ActionDashboard from '../components/ActionDashboard';

export function SocialDashboard() {
  const navigate = useNavigate();

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return (
    <ActionDashboard
      onNavigate={handleNavigate}
    />
  );
}
