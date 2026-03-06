import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import ActionDashboard from '../components/ActionDashboard';

export function SocialDashboard() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return (
    <ActionDashboard
      onNavigate={handleNavigate}
      darkMode={darkMode}
    />
  );
}
