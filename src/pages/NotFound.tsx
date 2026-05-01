import React from 'react';
import { useNavigate } from 'react-router-dom';

const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      height: '100vh',
      backgroundColor: 'var(--background)',
      color: 'var(--foreground)',
      textAlign: 'center'
    }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '15px' }}>
        Oops! This screen doesn't exist.
      </h1>
      <button
        onClick={() => navigate('/dashboard')}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--primary)',
          fontSize: '16px',
          cursor: 'pointer',
          textDecoration: 'underline'
        }}
      >
        Go to dashboard!
      </button>
    </div>
  );
};

export default NotFound;
