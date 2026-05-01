import React, { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase/config';
import { Mail, Lock, LogIn, Loader2, Eye, EyeOff, Activity } from 'lucide-react';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const canSubmit = useMemo(() => {
    return (
      /^\S+@\S+\.\S+$/.test(email.trim().toLowerCase()) &&
      password.length >= 6
    );
  }, [email, password]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) { setError('Enter a valid email address.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }

    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      localStorage.setItem('uid', cred.user.uid);
      // Once logged in successfully, navigate to the main dashboard
      navigate('/dashboard');
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else {
        setError('Unable to login. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: '#FFFFFF',
    width: '100%',
    outline: 'none',
    fontSize: '14px',
  };

  const shellStyle = (color: string): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(22, 36, 57, 0.6)',
    borderRadius: '23px',
    border: `1.5px solid ${color}`,
    padding: '0 16px',
    height: '46px',
    position: 'relative',
  });

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      padding: '20px',
      backgroundColor: '#050B15',
      color: '#FFFFFF',
      fontFamily: 'Inter, sans-serif',
      overflowY: 'auto',
    }}>
      <div style={{ maxWidth: '340px', width: '100%', textAlign: 'center', padding: '20px 0' }}>
        {/* Logo */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            width: '70px', height: '70px', borderRadius: '50%',
            backgroundColor: 'rgba(7, 18, 34, 0.8)', border: '2px solid #37E9C0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px', boxShadow: '0 0 20px rgba(55, 233, 192, 0.4)',
          }}>
            <Activity size={40} color="#37E9C0" strokeWidth={2.5} />
          </div>
          <h1 style={{ fontSize: '32px', margin: '0', fontWeight: '800', letterSpacing: '1px' }}>MQTT</h1>
          <p style={{ color: '#A8B2C1', fontSize: '13px', marginTop: '6px' }}>Log in to your account</p>
        </div>

        {/* Form */}
        <div style={{
          border: '1px solid rgba(51, 222, 255, 0.2)', borderRadius: '20px',
          padding: '20px', backgroundColor: 'rgba(7, 18, 34, 0.4)', backdropFilter: 'blur(10px)',
        }}>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {error && (
              <div style={{
                color: '#FF7B8A', fontSize: '13px', textAlign: 'center',
                padding: '10px', backgroundColor: 'rgba(255, 123, 138, 0.1)', borderRadius: '12px',
              }}>{error}</div>
            )}

            {/* Email */}
            <div style={shellStyle('rgba(62, 236, 255, 0.5)')}>
              <Mail size={18} color="#2BDFFF" style={{ marginRight: '10px', flexShrink: 0 }} />
              <input type="email" placeholder="Email address" value={email}
                onChange={(e) => setEmail(e.target.value)} autoComplete="email" style={inputStyle} />
            </div>

            {/* Password */}
            <div style={shellStyle('rgba(72, 236, 166, 0.5)')}>
              <Lock size={18} color="#48ECA6" style={{ marginRight: '10px', flexShrink: 0 }} />
              <input type={showPassword ? 'text' : 'password'} placeholder="Password"
                value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
                {showPassword ? <EyeOff size={18} color="#8A95A7" /> : <Eye size={18} color="#8A95A7" />}
              </button>
            </div>

            <div style={{ textAlign: 'right', marginTop: '2px' }}>
              <Link to="/forgot-password" style={{ color: '#4BEEB4', textDecoration: 'none', fontSize: '12px' }}>
                Forgot Password?
              </Link>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit || loading}
              style={{
                background: 'linear-gradient(90deg, #11C8FF, #45F89F)',
                color: '#00131F', border: 'none', borderRadius: '24px', height: '48px',
                fontSize: '16px', fontWeight: '700', cursor: 'pointer', marginTop: '6px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                opacity: !canSubmit || loading ? 0.6 : 1,
              }}
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : <LogIn size={20} />}
              Log In
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', margin: '16px 0', gap: '12px' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }} />
            <span style={{ color: '#8A95A7', fontSize: '12px' }}>Or log in with</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }} />
          </div>

          {/* Social Buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            {['Google', 'Apple'].map((provider) => (
              <button key={provider} type="button" style={{
                flex: 1, height: '42px', borderRadius: '21px',
                border: '1px solid rgba(255,255,255,0.1)',
                backgroundColor: 'rgba(47, 58, 79, 0.5)',
                color: '#FFFFFF', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '8px', fontSize: '13px', fontWeight: '600',
                cursor: 'pointer',
              }}>
                {provider === 'Google' ? (
                  <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google" style={{ width: '18px', height: '18px' }} />
                ) : (
                  <Activity size={18} color="#FFF" />
                )}
                {provider}
              </button>
            ))}
          </div>
        </div>

        <p style={{ marginTop: '16px', fontSize: '13px', color: '#A8B2C1' }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ color: '#4BEEB4', textDecoration: 'none', fontWeight: '700' }}>
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
