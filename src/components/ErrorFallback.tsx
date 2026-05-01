import { useState } from "react";
import { AlertCircle, X, RotateCcw } from "lucide-react";

export type ErrorFallbackProps = {
  error: Error;
  resetError: () => void;
};

export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const isDev = import.meta.env.DEV;

  const handleRestart = () => {
    try {
      window.location.reload();
    } catch (restartError) {
      console.error("Failed to restart app:", restartError);
      resetError();
    }
  };

  const formatErrorDetails = (): string => {
    let details = `Error: ${error.message}\n\n`;
    if (error.stack) {
      details += `Stack Trace:\n${error.stack}`;
    }
    return details;
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: 'var(--background)',
      color: 'var(--foreground)',
      padding: '24px',
      textAlign: 'center',
      fontFamily: 'Inter, sans-serif'
    }}>
      {isDev && (
        <button
          onClick={() => setIsModalVisible(true)}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '10px',
            cursor: 'pointer',
            color: 'var(--foreground)'
          }}
        >
          <AlertCircle size={20} />
        </button>
      )}

      <div style={{ maxWidth: '400px', width: '100%' }}>
        <div style={{
          width: '80px',
          height: '80px',
          backgroundColor: 'rgba(255, 68, 68, 0.1)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px'
        }}>
          <AlertCircle size={40} color="var(--destructive)" />
        </div>

        <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '16px' }}>
          Something went wrong
        </h1>

        <p style={{ color: 'var(--muted-foreground)', marginBottom: '32px', lineHeight: '1.5' }}>
          An unexpected error occurred. Please reload the app to continue.
        </p>

        <button
          onClick={handleRestart}
          className="neon-button"
          style={{
            width: '100%',
            height: '56px',
            fontSize: '16px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px'
          }}
        >
          <RotateCcw size={20} />
          Try Again
        </button>
      </div>

      {isModalVisible && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'flex-end'
        }}>
          <div style={{
            width: '100%',
            height: '80vh',
            backgroundColor: 'var(--background)',
            borderTopLeftRadius: '24px',
            borderTopRightRadius: '24px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px',
              borderBottom: '1px solid var(--border)'
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: '600' }}>Error Details</h2>
              <button
                onClick={() => setIsModalVisible(false)}
                style={{ background: 'none', border: 'none', color: 'var(--foreground)', cursor: 'pointer' }}
              >
                <X size={24} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              <pre style={{
                backgroundColor: 'var(--card)',
                padding: '16px',
                borderRadius: '12px',
                fontSize: '12px',
                lineHeight: '1.5',
                color: 'var(--foreground)',
                whiteSpace: 'pre-wrap',
                textAlign: 'left',
                fontFamily: 'monospace'
              }}>
                {formatErrorDetails()}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
