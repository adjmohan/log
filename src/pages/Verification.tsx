import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getFaceEmbedding } from '../api/face';
import { FaceVision } from '../lib/FaceVision';
import { Shield, Loader2, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';

const VERIFY_INTERVAL_MS = 1500;
const REQUIRED_STABLE_MATCHES = 3;
const MAX_MISMATCH_CHECKS = 20;
const FACE_MATCH_DISTANCE_THRESHOLD = 0.5;

const Verification: React.FC = () => {
  const { exerciseType } = useParams<{ exerciseType: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState('Initializing Security Scan...');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const faceLandmarkerRef = useRef<any>(null);
  const verifyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [storedEmbedding, setStoredEmbedding] = useState<number[] | null>(null);

  const getCameraErrorMessage = (err: unknown) => {
    const name = (err as { name?: string })?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'Camera access denied. Please allow camera permission in app/browser settings.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'No camera found on this device.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'Camera is busy in another app. Close other camera apps and retry.';
    }
    return 'Unable to start camera. Please try again.';
  };

  const initCamera = async () => {
    try {
      setPermissionDenied(false);
      setError(null);
      setLoading(true);

      if (!navigator.mediaDevices?.getUserMedia) {
        throw { name: 'NotSupportedError' };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Wait for video to be ready then explicitly play before verifying
        videoRef.current.onloadedmetadata = async () => {
          try {
            await videoRef.current?.play();
          } catch (playError) {
            console.warn('Video play() warning:', playError);
          }
          setLoading(false);
          if (storedEmbedding) startVerification(storedEmbedding);
        };
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setPermissionDenied(true);
      setError(getCameraErrorMessage(err));
      setLoading(false);
    }
  };

  useEffect(() => {
    const initData = async () => {
      if (!user) return;
      try {
        const embedding = await getFaceEmbedding(user.uid);
        if (!embedding || embedding.length === 0) {
          navigate('/face-setup');
          return;
        }
        setStoredEmbedding(embedding);

        const landmarker = await FaceVision.getInstance();
        faceLandmarkerRef.current = landmarker;

        // Try to init camera
        await initCamera();
      } catch (err) {
        setError("Security module failed to load.");
        setLoading(false);
      }
    };

    initData();

    return () => {
      if (verifyIntervalRef.current) {
        clearInterval(verifyIntervalRef.current);
      }
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach(track => track.stop());
    };
  }, [user, navigate]);

  const startVerification = (embedding: number[]) => {
    let stableMatches = 0;
    let mismatchChecks = 0;

    if (verifyIntervalRef.current) {
      clearInterval(verifyIntervalRef.current);
    }

    verifyIntervalRef.current = setInterval(() => {
      if (!videoRef.current || !faceLandmarkerRef.current || verified) {
        return;
      }

      if (videoRef.current.readyState < 2) {
        return;
      }

      try {
        const results = faceLandmarkerRef.current.detectForVideo(videoRef.current, performance.now());
        const faces = results?.faceLandmarks ?? [];

        if (!faces.length) {
          stableMatches = 0;
          setStatus('Position your face in the circle');
          return;
        }

        let bestDistance = Number.POSITIVE_INFINITY;
        let bestIndex = -1;

        faces.forEach((face: any[], index: number) => {
          const liveEmbedding = FaceVision.calculateEmbedding(face);
          if (!liveEmbedding.length) {
            return;
          }

          const distance = FaceVision.euclideanDistance(liveEmbedding, embedding);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
          }
        });

        if (bestIndex < 0) {
          stableMatches = 0;
          mismatchChecks += 1;
          setStatus('Face quality too low. Keep steady.');
        } else if (bestDistance <= FACE_MATCH_DISTANCE_THRESHOLD) {
          stableMatches += 1;
          mismatchChecks = 0;

          setStatus(`Verifying Identity... ${Math.round((stableMatches / REQUIRED_STABLE_MATCHES) * 100)}%`);

          if (stableMatches >= REQUIRED_STABLE_MATCHES) {
            setVerified(true);
            setStatus('Identity Verified');
            if (verifyIntervalRef.current) {
              clearInterval(verifyIntervalRef.current);
              verifyIntervalRef.current = null;
            }
            setTimeout(() => navigate(`/live-tracking/${exerciseType}`), 800);
          }
        } else {
          stableMatches = 0;
          mismatchChecks += 1;
          setStatus('Identity mismatch. Please look directly at the camera.');
        }

        if (mismatchChecks >= MAX_MISMATCH_CHECKS) {
          if (verifyIntervalRef.current) {
            clearInterval(verifyIntervalRef.current);
            verifyIntervalRef.current = null;
          }
          setError('Verification failed repeatedly. Re-register Face ID for better accuracy.');
          setStatus('Verification failed');
        }
      } catch (e) {
        console.error('Detection error:', e);
      }
    }, VERIFY_INTERVAL_MS);
  };

  if (permissionDenied) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#02070D', padding: '1.5rem', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', width: '80px', height: '80px', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', border: '1px solid #ef4444' }}>
          <AlertCircle size={40} color="#ef4444" />
        </div>
        <h1 style={{ color: 'white', fontSize: '24px', fontWeight: '700', marginBottom: '1rem' }}>Camera access denied</h1>
        <p style={{ color: '#94A3B8', marginBottom: '2rem', maxWidth: '280px' }}>Security scan requires camera access. Please enable it in your browser settings to continue.</p>
        <button className="neon-button" style={{ width: '100%', maxWidth: '300px' }} onClick={initCamera}>
          TRY AGAIN
        </button>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#94A3B8', marginTop: '1.5rem', cursor: 'pointer' }}>
          GO BACK
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#050B15', padding: '1.5rem' }}>
      <button
        onClick={() => navigate(-1)}
        style={{ background: 'none', border: 'none', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '0.5rem', alignSelf: 'flex-start', marginBottom: '2rem' }}
      >
        <ArrowLeft size={20} /> Back
      </button>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div className="glass-container" style={{ textAlign: 'center', padding: '2.5rem 1.5rem', width: '100%', maxWidth: '400px' }}>
          <div style={{ background: verified ? 'rgba(55, 233, 192, 0.1)' : 'rgba(255, 255, 255, 0.05)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
            {verified ? <CheckCircle color="#37E9C0" size={40} /> : <Shield color="#37E9C0" size={40} />}
          </div>

          <h2 className="glow-text" style={{ fontSize: '1.75rem', marginBottom: '0.5rem', color: '#37E9C0' }}>Biometric Login</h2>
          <p style={{ color: '#94A3B8', marginBottom: '2rem', minHeight: '3em' }}>{status}</p>

          <div style={{ position: 'relative', width: '220px', height: '220px', margin: '0 auto', borderRadius: '50%', overflow: 'hidden', border: `4px solid ${verified ? '#37E9C0' : 'rgba(255,255,255,0.1)'}`, boxShadow: verified ? '0 0 30px rgba(55, 233, 192, 0.3)' : 'none' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
            />

            {/* Scanning Ring Animation */}
            {!verified && !loading && (
              <div style={{ position: 'absolute', inset: 0, border: '2px solid #37E9C0', borderRadius: '50%', opacity: 0.3, animation: 'pulse 2s infinite' }} />
            )}

            {loading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5, 11, 21, 0.8)' }}>
                <Loader2 className="animate-spin" size={32} color="#37E9C0" />
              </div>
            )}
          </div>

          {error && (
            <div style={{ marginTop: '1.5rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={18} /> {error}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.95); opacity: 0.5; }
          50% { transform: scale(1.05); opacity: 0.2; }
          100% { transform: scale(0.95); opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

export default Verification;
