import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Register from './pages/Register';
import Login from './pages/Login';
import FaceSetup from './pages/FaceSetup';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Profile from './pages/Profile';
import Verification from './pages/Verification';
import ActiveWorkout from './pages/ActiveWorkout';
import LiveTracking from './pages/LiveTracking';
import WorkoutSelection from './pages/WorkoutSelection';
import MainLayout from './components/MainLayout';
import SplashScreen from './pages/SplashScreen';
import ForgotPassword from './pages/ForgotPassword';
import NotFound from './pages/NotFound';
import { useEffect } from 'react';
import { initNetworkSync } from './services/syncQueue';
import './index.css';

function AppContent() {
  const { user } = useAuth();
  const location = useLocation();

  return (
    <Routes>
      {/* Splash screen – shown first on every launch */}
      <Route path="/splash" element={<SplashScreen />} />

      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      <Route element={<PrivateRoute><MainLayout /></PrivateRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/workout-selection" element={<WorkoutSelection />} />
        <Route path="/history" element={<History />} />
        <Route path="/profile" element={<Profile />} />
      </Route>

      <Route path="/face-setup" element={
        <PrivateRoute>
          <FaceSetup />
        </PrivateRoute>
      } />

      <Route path="/workout/:exerciseType" element={
        <PrivateRoute>
          <Verification />
        </PrivateRoute>
      } />
      <Route path="/workout-active/:exerciseType" element={
        <PrivateRoute>
          <ActiveWorkout />
        </PrivateRoute>
      } />
      <Route path="/live-tracking/:exerciseType" element={
        <PrivateRoute>
          <LiveTracking />
        </PrivateRoute>
      } />
      {/* Root always goes to splash first */}
      <Route path="/" element={<Navigate to="/splash" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#02070D' }}>
        <div className="animate-spin" style={{ width: 40, height: 40, border: '4px solid #4EF2B6', borderTopColor: 'transparent', borderRadius: '50%' }} />
      </div>
    );
  }

  return user ? <>{children}</> : <Navigate to="/login" />;
};

import { WorkoutProvider } from './contexts/WorkoutContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from './components/ErrorBoundary';

const queryClient = new QueryClient();

function App() {
  useEffect(() => {
    initNetworkSync().catch((error) => {
      console.error('Failed to initialize offline sync listener:', error);
    });
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <WorkoutProvider>
            <Router>
              <AppContent />
            </Router>
          </WorkoutProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
