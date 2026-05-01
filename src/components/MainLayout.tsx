import React, { useEffect, useRef } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Dumbbell, History, User } from 'lucide-react';
import { startBackgroundStepTracker, type TrackerController } from '../services/backgroundStepTracker';

const MainLayout: React.FC = () => {
  const trackerRef = useRef<TrackerController | null>(null);

  useEffect(() => {
    startBackgroundStepTracker()
      .then((controller) => {
        trackerRef.current = controller;
      })
      .catch(() => {
        // Motion sensors are unavailable on some desktop browsers.
      });

    return () => {
      if (trackerRef.current) {
        trackerRef.current.stop();
        trackerRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '90px' }}>
      <Outlet />

      <nav className="bottom-tabs">
        <NavLink to="/dashboard" className={({ isActive }) => `tab-item ${isActive ? 'active' : ''}`}>
          <LayoutDashboard size={24} />
          <span>Dashboard</span>
        </NavLink>
        <NavLink to="/workout-selection" className={({ isActive }) => `tab-item ${isActive ? 'active' : ''}`}>
          <Dumbbell size={24} />
          <span>Workout</span>
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => `tab-item ${isActive ? 'active' : ''}`}>
          <History size={24} />
          <span>History</span>
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => `tab-item ${isActive ? 'active' : ''}`}>
          <User size={24} />
          <span>Profile</span>
        </NavLink>
      </nav>
    </div>
  );
};

export default MainLayout;
