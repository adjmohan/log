import React, { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase/config';
import { Mail, Lock, User, Phone, LogIn, Loader2, Eye, EyeOff, Activity } from 'lucide-react';

const Register: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const canSubmit = useMemo(() => {
    const digitsOnly = phone.replace(/\D/g, '');
    return (
      name.trim().length >= 2 &&
      /^\S+@\S+\.\S+$/.test(email.trim().toLowerCase()) &&
      digitsOnly.length >= 8 &&
      password.length >= 6 &&
      confirmPassword.length >= 6
    );
  }, [name, email, phone, password, confirmPassword]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const digitsOnly = phone.replace(/\D/g, '');

    if (normalizedName.length < 2) { setError('Name must be at least 2 characters.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) { setError('Enter a valid email address.'); return; }
    if (digitsOnly.length < 8) { setError('Enter a valid phone number.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      localStorage.setItem('uid', cred.user.uid);
      localStorage.setItem('profile', JSON.stringify({
        name: normalizedName,
        age: 25,
        weight: 70,
        height: 170,
        goal: 'Build Muscle',
        email: normalizedEmail,
        phone: digitsOnly,
      }));
      navigate('/face-setup');
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered.');
      } else {
        setError('Unable to create account. Please try again.');
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
          <p style={{ color: '#A8B2C1', fontSize: '13px', marginTop: '6px' }}>Complete face scan to finish registration</p>
        </div>

        {/* Form */}
        <div style={{
          border: '1px solid rgba(51, 222, 255, 0.2)', borderRadius: '20px',
          padding: '20px', backgroundColor: 'rgba(7, 18, 34, 0.4)', backdropFilter: 'blur(10px)',
        }}>
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {error && (
              <div style={{
                color: '#FF7B8A', fontSize: '13px', textAlign: 'center',
                padding: '10px', backgroundColor: 'rgba(255, 123, 138, 0.1)', borderRadius: '12px',
              }}>{error}</div>
            )}

            {/* Name */}
            <div style={shellStyle('rgba(62, 236, 255, 0.5)')}>
              <User size={18} color="#2BDFFF" style={{ marginRight: '10px', flexShrink: 0 }} />
              <input type="text" placeholder="Full Name" value={name}
                onChange={(e) => setName(e.target.value)} style={inputStyle} />
            </div>

            {/* Email */}
            <div style={shellStyle('rgba(62, 236, 255, 0.5)')}>
              <Mail size={18} color="#2BDFFF" style={{ marginRight: '10px', flexShrink: 0 }} />
              <input type="email" placeholder="Email address" value={email}
                onChange={(e) => setEmail(e.target.value)} autoComplete="email" style={inputStyle} />
            </div>

            {/* Phone */}
            <div style={shellStyle('rgba(72, 236, 166, 0.5)')}>
              <Phone size={18} color="#48ECA6" style={{ marginRight: '10px', flexShrink: 0 }} />
              <input type="tel" placeholder="Phone number" value={phone}
                onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
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

            {/* Confirm Password */}
            <div style={shellStyle('rgba(72, 236, 166, 0.5)')}>
              <Lock size={18} color="#48ECA6" style={{ marginRight: '10px', flexShrink: 0 }} />
              <input type={showConfirmPassword ? 'text' : 'password'} placeholder="Confirm Password"
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={inputStyle} />
              <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
                {showConfirmPassword ? <EyeOff size={18} color="#8A95A7" /> : <Eye size={18} color="#8A95A7" />}
              </button>
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
              Create Account
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', margin: '16px 0', gap: '12px' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }} />
            <span style={{ color: '#8A95A7', fontSize: '12px' }}>Or sign up with</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }} />
          </div>

          {/* Social Buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            {['Google', 'Apple'].map((provider) => (
              <button key={provider} style={{
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
          Already have an account?{' '}
          <Link to="/login" style={{ color: '#4BEEB4', textDecoration: 'none', fontWeight: '700' }}>
            Log In
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
