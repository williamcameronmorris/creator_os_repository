import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import ActionDashboard from '../components/ActionDashboard';

export function SocialDashboard() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();

  const handleViewDeal = (dealId: string) => {
    navigate(`/pipeline?deal=${dealId}`);
  };

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return (
    <ActionDashboard
      onViewDeal={handleViewDeal}
      onNavigate={handleNavigate}
      darkMode={darkMode}
    />
  );
}
