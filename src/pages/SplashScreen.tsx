import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';
import '../styles/SplashScreen.css';
import { getUserSession } from '../services/sessionStorage';

const SplashScreen = () => {
  const navigate = useNavigate();
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    let active = true;
    let navTimer: ReturnType<typeof setTimeout> | null = null;

    const routeFromStorage = async () => {
      const stored = await getUserSession();
      if (!active) {
        return;
      }

      const targetPath = stored?.userId ? '/dashboard' : '/login';
      navTimer = setTimeout(() => {
        if (active) {
          navigate(targetPath, { replace: true });
        }
      }, 2700);
    };

    const fadeTimer = setTimeout(() => setFadeOut(true), 2200);
    routeFromStorage();

    return () => {
      active = false;
      clearTimeout(fadeTimer);
      if (navTimer) {
        clearTimeout(navTimer);
      }
    };
  }, [navigate]);

  return (
    <div className={`sp-root ${fadeOut ? 'sp-out' : ''}`}>
      <img src={logo} alt="MQTT" className="sp-logo" />
    </div>
  );
};

export default SplashScreen;
