import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, ArrowLeft } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const canSubmit = useMemo(() => /^\S+@\S+\.\S+$/.test(email.trim().toLowerCase()), [email]);

  const handleSendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    setLoading(true);
    setMessage(null);

    try {
      const result = await sendPasswordReset(normalizedEmail);
      if (result.sent) {
        setMessage({ type: 'success', text: `We sent a password reset link to ${normalizedEmail}.` });
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unable to process password reset.";
      setMessage({ type: 'error', text: messageText });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '20px',
      background: 'linear-gradient(to bottom, #020812, #091429, #04101D)',
      color: 'white',
      fontFamily: 'Inter, sans-serif'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div style={{
          width: '96px',
          height: '96px',
          borderRadius: '50%',
          border: '2px solid rgba(55, 233, 192, 0.7)',
          backgroundColor: 'rgba(4, 25, 43, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px'
        }}>
          <Lock size={48} color="#37E9C0" />
        </div>
        <h1 className="glow-text" style={{ fontSize: '36px', fontWeight: 700, margin: '0 0 8px' }}>MQTT</h1>
        <p style={{ color: '#A8B2C1', fontSize: '14px' }}>Reset your account password</p>
      </div>

      <div className="glass-container" style={{
        maxWidth: '400px',
        width: '100%',
        margin: '0 auto',
        padding: '24px',
        backgroundColor: 'rgba(7, 18, 34, 0.6)',
        border: '1px solid rgba(51, 222, 255, 0.32)'
      }}>
        <form onSubmit={handleSendReset} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="pill-input" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 16px', height: '56px' }}>
            <Mail size={20} color="#11C8FF" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                color: 'white',
                outline: 'none',
                fontSize: '15px'
              }}
            />
          </div>

          {message && (
            <p style={{
              fontSize: '13px',
              color: message.type === 'success' ? '#45F89F' : '#FF4444',
              textAlign: 'center',
              margin: '0'
            }}>
              {message.text}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="neon-button"
            style={{
              width: '100%',
              height: '56px',
              opacity: (!canSubmit || loading) ? 0.5 : 1,
              background: 'linear-gradient(to right, #11C8FF, #45F89F)',
              color: '#00131F',
              fontSize: '16px'
            }}
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <button
          onClick={() => navigate('/login')}
          style={{
            marginTop: '20px',
            background: 'none',
            border: 'none',
            color: '#4EDCFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            width: '100%',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          <ArrowLeft size={16} />
          Back to login
        </button>
      </div>
    </div>
  );
}
