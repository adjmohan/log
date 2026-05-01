import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { FaceVision } from '../lib/FaceVision';
import { averageEmbeddings, registerUserWithFace } from '../api/face';
import { Loader2, CheckCircle, ScanFace, ChevronRight, AlertCircle } from 'lucide-react';



// Face positioning & stability constants for FAST scanning
const CIRCLE_TOLERANCE = 100;
const MIN_FACE_WIDTH_RATIO = 0.18;
const MAX_FACE_WIDTH_RATIO = 0.65;
const STABILITY_FRAMES = 5; // Super fast stability check
const BLINK_THRESHOLD = 0.22;
const STABILITY_REQUIRED_MS = 600; // Accelerated locking mechanism
const REQUIRED_FACE_SAMPLES = 8;
const SAMPLE_INTERVAL_MS = 140;

const FaceSetup: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('Initializing advanced scanner...');
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<'centered' | 'too-far' | 'too-small' | 'too-large' | 'multiple' | 'none'>('none');
  const { user } = useAuth();
  const navigate = useNavigate();
  const faceLandmarkerRef = useRef<any>(null);
  const requestRef = useRef<number | undefined>(undefined);
  const scanStartedRef = useRef(false);
  const faceSavedRef = useRef(false);
  const lastEyeOpenRef = useRef<boolean[]>([true, true]);
  const blinkCountRef = useRef(0);
  const capturedEmbeddingsRef = useRef<number[][]>([]);
  const lastSampleAtRef = useRef(0);

  const stopCameraStream = () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const initCamera = async () => {
    try {
      setPermissionDenied(false);
      setCameraError(null);
      setLoading(true);
      setScanning(false);
      setProgress(0);
      setStatus("Requesting camera permission...");

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('NotSupportedError');
      }

      stopCameraStream();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'user' },
          width: { ideal: 480 },
          height: { ideal: 360 },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = async () => {
          try {
            await videoRef.current?.play();
            // Match canvas size to video size
            if (canvasRef.current) {
              canvasRef.current.width = videoRef.current!.videoWidth;
              canvasRef.current.height = videoRef.current!.videoHeight;
            }
          } catch (playError) {
            console.warn('Video play() warning:', playError);
          }
          setLoading(false);
          setStatus("Align your face within the scanner");
          setScanning(true);
          if (faceLandmarkerRef.current) {
            startAutoScan();
          }
        };
      }
    } catch (err) {
      console.error("Camera error:", err);
      const name = (err as { name?: string })?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setPermissionDenied(true);
        setCameraError('Camera permission denied. Enable camera access in device settings, then try again.');
        setStatus('Camera permission denied.');
      } else {
        setPermissionDenied(true);
        setCameraError('Camera error. Please ensure camera is accessible and not used by another app.');
        setStatus('Camera error. Please ensure camera is accessible.');
      }
      setLoading(false);
      setScanning(false);
    }
  };

  useEffect(() => {
    const initFaceVision = async () => {
      try {
        console.log('Loading AI models...');
        await initCamera();
        const landmarker = await FaceVision.getInstance();
        faceLandmarkerRef.current = landmarker;
        if (videoRef.current?.srcObject) {
          startAutoScan();
        }
      } catch (err) {
        console.error("Advanced vision init error:", err);
        setStatus("Vision model failed to load.");
      }
    };

    initFaceVision();

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      stopCameraStream();
    };
  }, []);

  const getEyeOpenness = (landmarks: any[]): number[] => {
    const leftEyeOpen = Math.hypot(landmarks[145]?.x - landmarks[160]?.x, landmarks[145]?.y - landmarks[160]?.y) || 0;
    const rightEyeOpen = Math.hypot(landmarks[374]?.x - landmarks[387]?.x, landmarks[374]?.y - landmarks[387]?.y) || 0;
    return [leftEyeOpen, rightEyeOpen];
  };

  const getFaceBoxFromLandmarks = (landmarks: any[]) => {
    const xs = landmarks.map((p) => p.x);
    const ys = landmarks.map((p) => p.y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  };

  const isFaceCentered = (faceBox: any, vw: number, vh: number) => {
    const centerX = (faceBox.minX + faceBox.maxX) / 2;
    const centerY = (faceBox.minY + faceBox.maxY) / 2;
    const dxPx = Math.abs(centerX - 0.5) * vw;
    const dyPx = Math.abs(centerY - 0.5) * vh;
    return dxPx < CIRCLE_TOLERANCE && dyPx < CIRCLE_TOLERANCE;
  };

  const startAutoScan = async () => {
    if (!faceLandmarkerRef.current || scanStartedRef.current) return;
    scanStartedRef.current = true;
    let stableFrames = 0;
    let stableSince: number | null = null;

    const autoScan = async () => {
      if (!videoRef.current || !canvasRef.current || !faceLandmarkerRef.current) return;

      if (videoRef.current.readyState >= 2) {
        try {
          const results = faceLandmarkerRef.current.detectForVideo(videoRef.current, performance.now());
          const canvasCtx = canvasRef.current.getContext('2d');

          if (canvasCtx) {
            canvasCtx.save();
            canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            // Flip context horizontally for mirror effect render matching CSS
            canvasCtx.translate(canvasRef.current.width, 0);
            canvasCtx.scale(-1, 1);
            
            if (results?.faceLandmarks && results.faceLandmarks.length > 0) {
                // Render advanced scanning mesh onto the face
                FaceVision.drawMesh(canvasCtx, results.faceLandmarks[0]);
            }
            canvasCtx.restore();
          }

          if (!results || !results.faceLandmarks || results.faceLandmarks.length === 0) {
            setStatus('No face detected. Looking for face...');
            setFeedback('none');
            stableFrames = 0;
            stableSince = null;
            setProgress(0);
            requestRef.current = requestAnimationFrame(autoScan);
            return;
          }

          if (results.faceLandmarks.length > 1) {
            setStatus('Multiple faces detected. Only one face allowed.');
            setFeedback('multiple');
            stableFrames = 0;
            stableSince = null;
            setProgress(0);
            requestRef.current = requestAnimationFrame(autoScan);
            return;
          }

          const landmarks = results.faceLandmarks[0];
          const faceBox = getFaceBoxFromLandmarks(landmarks);
          const vw = videoRef.current.videoWidth || 640;
          const vh = videoRef.current.videoHeight || 480;

          if (!isFaceCentered(faceBox, vw, vh)) {
            setStatus('Center your face in the circle');
            setFeedback('too-far');
            stableFrames = 0;
            stableSince = null;
            setProgress(0);
            requestRef.current = requestAnimationFrame(autoScan);
            return;
          }

          const faceWidth = (faceBox.maxX - faceBox.minX) * vw;
          const faceRatio = faceWidth / vw;

          if (faceRatio < MIN_FACE_WIDTH_RATIO) {
            setStatus('Move closer to the screen');
            setFeedback('too-small');
            stableFrames = 0;
            stableSince = null;
            setProgress(0);
            requestRef.current = requestAnimationFrame(autoScan);
            return;
          } else if (faceRatio > MAX_FACE_WIDTH_RATIO) {
             setStatus('Move slightly further away');
             setFeedback('too-large');
             stableFrames = 0;
             stableSince = null;
             setProgress(0);
             requestRef.current = requestAnimationFrame(autoScan);
             return;
          }

          // Blinking constraint
          const [leftEyeOpen, rightEyeOpen] = getEyeOpenness(landmarks);
          const leftBlink = leftEyeOpen < BLINK_THRESHOLD;
          const rightBlink = rightEyeOpen < BLINK_THRESHOLD;

          if (lastEyeOpenRef.current[0] !== leftBlink || lastEyeOpenRef.current[1] !== rightBlink) {
            if (leftBlink || rightBlink) blinkCountRef.current++;
          }
          lastEyeOpenRef.current = [leftBlink, rightBlink];

          // Face is stable & positioned perfectly
          setFeedback('centered');
          const now = Date.now();
          if (!stableSince) stableSince = now;
          stableFrames++;

          const stableMs = now - stableSince;
          setProgress(Math.min(100, Math.max(0, (stableMs / STABILITY_REQUIRED_MS) * 100)));

          if (stableMs >= STABILITY_REQUIRED_MS && stableFrames >= STABILITY_FRAMES) {
            if (blinkCountRef.current > 0) {
              setStatus('Capturing ArcFace profile...');
            } else {
              setStatus('Hold steady for ArcFace scan...');
            }

            const embedding = FaceVision.calculateEmbedding(landmarks);
            const nowSample = Date.now();

            if (embedding && embedding.length > 0 && nowSample - lastSampleAtRef.current >= SAMPLE_INTERVAL_MS) {
              capturedEmbeddingsRef.current.push(embedding);
              lastSampleAtRef.current = nowSample;
              setProgress(Math.min(100, (capturedEmbeddingsRef.current.length / REQUIRED_FACE_SAMPLES) * 100));
              setStatus(`ArcFace scan ${capturedEmbeddingsRef.current.length}/${REQUIRED_FACE_SAMPLES}`);

              if (capturedEmbeddingsRef.current.length >= REQUIRED_FACE_SAMPLES) {
                const averagedEmbedding = averageEmbeddings(capturedEmbeddingsRef.current);
                await saveEmbedding(averagedEmbedding);
                return;
              }
            } else {
              console.warn("Embedding generation failed or returned empty array.");
            }
          } else {
            setStatus('Locking on target... Hold steady.');
          }
        } catch (err) {
          console.error('Fast scan error:', err);
          setStatus('Camera sync error. Keep face centered.');
          setFeedback('none');
          stableFrames = 0;
          stableSince = null;
          setProgress(0);
        }
      }
      requestRef.current = requestAnimationFrame(autoScan);
    };

    requestRef.current = requestAnimationFrame(autoScan);
  };

  const saveEmbedding = async (embedding: number[]) => {
    if (faceSavedRef.current) return;
    faceSavedRef.current = true;

    // ✅ VALIDATE EMBEDDING BEFORE PROCEEDING
    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      console.error('[saveEmbedding] Invalid embedding:', embedding);
      setStatus('❌ Face scan failed: Invalid biometric data. Try again.');
      setScanning(false);
      faceSavedRef.current = false;
      setTimeout(() => {
        faceSavedRef.current = false;
        setStatus('Position your face and try again.');
        setProgress(0);
        setFeedback('none');
      }, 3000);
      return;
    }

    // ✅ CHECK EMBEDDING QUALITY
    const hasNaN = embedding.some(v => !Number.isFinite(v));
    if (hasNaN) {
      console.error('[saveEmbedding] Embedding contains invalid numbers:', embedding);
      setStatus('❌ Face scan corrupted: Contains invalid data. Try again.');
      setScanning(false);
      faceSavedRef.current = false;
      setTimeout(() => {
        faceSavedRef.current = false;
        setStatus('Position your face and try again.');
        setProgress(0);
        setFeedback('none');
      }, 3000);
      return;
    }

    const rawProfile = localStorage.getItem('profile');
    const profile = rawProfile ? JSON.parse(rawProfile) : {};
    const userId = (localStorage.getItem('uid') || user?.uid || '').trim();

    if (!userId) {
      console.error('[saveEmbedding] Missing userId. localStorage uid:', localStorage.getItem('uid'), 'auth uid:', user?.uid);
      setStatus('❌ Registration failed: User ID missing. Sign in again.');
      setScanning(false);
      faceSavedRef.current = false;
      return;
    }

    console.log('[saveEmbedding] Starting DB sync...', {
      userId,
      embeddingLength: embedding.length,
      hasName: !!profile?.name,
    });

    setStatus(`✓ Embedding captured. Syncing to database...`);
    try {
      const result = await registerUserWithFace({
        userId,
        embedding,
        name: profile?.name,
        age: profile?.age,
        weight: profile?.weight,
        height: profile?.height,
        email: profile?.email,
        phone: profile?.phone,
        goal: profile?.goal,
      });

      console.log('[saveEmbedding] SUCCESS:', result);
      localStorage.removeItem('profile');
      setStatus('✅ Face ID Successfully Saved!');
      setScanning(false);
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = undefined;
      }
      // Instant transition
      setTimeout(() => navigate('/dashboard'), 1200);
    } catch (err) {
      faceSavedRef.current = false;
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[saveEmbedding] FAILED:', message);
      setStatus(`❌ DB Error: ${message}`);
      setScanning(false);
      
      // Allow retry after 4 seconds
      setTimeout(() => {
        faceSavedRef.current = false;
        setStatus('Position your face to try again.');
        setProgress(0);
        setFeedback('none');
      }, 4000);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'radial-gradient(circle at center, #0B162C 0%, #02050A 100%)', padding: '1.5rem', color: '#fff', alignItems: 'center' }}>
      <header style={{ marginBottom: '2.5rem', textAlign: 'center', marginTop: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
           <ScanFace size={36} color="#37E9C0" className="animate-pulse" />
           <h1 style={{ fontSize: '2.2rem', color: '#37E9C0', textShadow: '0 0 20px rgba(55,233,192,0.4)', margin: 0, fontWeight: 800 }}>Face Setup</h1>
        </div>
        <p style={{ color: '#94A3B8', fontSize: '1rem', maxWidth: '300px', margin: '0 auto' }}>Position your face in the circle for auto-scanning.</p>
      </header>

      <div style={{ position: 'relative', width: '320px', height: '320px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        {/* Dynamic Glowing Border Context */}
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: `6px solid ${
            progress === 100 ? '#37E9C0' :
            feedback === 'centered' ? '#37E9C0' :
            feedback === 'multiple' ? '#ef4444' :
            feedback === 'too-small' || feedback === 'too-large' ? '#f97316' :
            'rgba(55, 233, 192, 0.15)'
          }`,
          boxShadow: progress === 100 ? '0 0 60px rgba(55,233,192,0.6)' : feedback === 'centered' ? '0 0 30px rgba(55,233,192,0.3)' : 'inset 0 0 30px rgba(0,0,0,0.8)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: 10,
          pointerEvents: 'none'
        }} />

        {/* Circular Scanner Spinner */}
        {scanning && progress > 0 && progress < 100 && (
          <div style={{
            position: 'absolute', inset: -16, border: '4px solid transparent', borderTopColor: '#37E9C0', borderRightColor: '#37E9C0', borderRadius: '50%',
            animation: 'spin 0.6s cubic-bezier(0.68, -0.55, 0.27, 1.55) infinite', opacity: 0.8, zIndex: 11
          }} />
        )}

        {/* Media Window restricted explicitly to pure circle */}
        <div style={{ position: 'absolute', inset: 4, borderRadius: '50%', overflow: 'hidden', background: '#000' }}>
            <video
              ref={videoRef}
              autoPlay playsInline muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} // Mirror video
            />
            {/* Overlay Mesh Canvas on top of Video, Mirrored to match video transform */}
            <canvas
              ref={canvasRef}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            />

            {loading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5, 11, 21, 0.6)', backdropFilter: 'blur(4px)' }}>
                <Loader2 className="animate-spin" size={64} color="#37E9C0" />
              </div>
            )}

            {progress === 100 && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(55, 233, 192, 0.25)', backdropFilter: 'blur(2px)' }}>
                <CheckCircle size={96} color="#37E9C0" style={{ filter: 'drop-shadow(0 0 10px rgba(55,233,192,0.8))' }} />
              </div>
            )}
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '340px', marginTop: '2.5rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '24px', padding: '1.2rem', textAlign: 'center', backdropFilter: 'blur(10px)' }}>
          {permissionDenied && (
            <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start', padding: '0.9rem', borderRadius: '18px', marginBottom: '1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', textAlign: 'left' }}>
              <AlertCircle size={20} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <p style={{ margin: 0, color: '#FCA5A5', fontWeight: 700, fontSize: '0.95rem' }}>Camera permission blocked</p>
                <p style={{ margin: '0.35rem 0 0', color: '#F8FAFC', fontSize: '0.82rem', lineHeight: 1.5 }}>{cameraError}</p>
              </div>
            </div>
          )}

          <h3 style={{ 
              margin: '0 0 10px 0', fontSize: '1.1rem', fontWeight: 'bold', 
              color: progress === 100 || feedback === 'centered' ? '#37E9C0' : feedback === 'too-small' || feedback === 'too-large' ? '#f97316' : feedback === 'multiple' ? '#ef4444' : '#94A3B8'
          }}>
              {status}
          </h3>

          <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '10px', overflow: 'hidden', margin: '0.8rem 0' }}>
             <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #37E9C0, #4EF2B6)', transition: 'width 0.2s ease' }} />
          </div>

          <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B' }}>
             {feedback === 'centered' ? 'Keep perfectly still.' : 
             feedback === 'too-small' ? 'Move device closer.' :
             feedback === 'too-large' ? 'Move device back slightly.' :
             feedback === 'too-far' ? 'Align your face squarely in the ring.' :
             progress === 100 ? 'Syncing to database...' :
             'Scanning your facial vectors...'}
          </p>

           {!loading && !scanning && progress !== 100 && (
             <button onClick={initCamera} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', margin: '1.2rem auto 0', padding: '10px 24px', background: 'rgba(55,233,192,0.1)', border: '1px solid rgba(55,233,192,0.3)', color: '#37E9C0', borderRadius: '30px', fontWeight: 'bold', cursor: 'pointer' }}>
               {permissionDenied ? 'Grant Camera Access' : 'Restart Camera'} <ChevronRight size={18} />
             </button>
          )}
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default FaceSetup;
