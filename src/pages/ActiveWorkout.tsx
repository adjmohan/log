import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { saveWorkoutSession } from '../api/db';
import { PoseVision } from '../lib/PoseVision';
import { RepCounter } from '../lib/RepCounter';
import { PoseVisualizer } from '../components/PoseVisualizer';
import { calculateCalories, EXERCISE_INFO } from '../utils/calories';
import type { ExerciseType } from '../types';
import { Play, Pause, Square, Loader2, Zap, Flame, X, CheckCircle, Trophy } from 'lucide-react';

const FEEDBACK_MESSAGES = [
  "Keep it up!",
  "Great form!",
  "Looking strong!",
  "Perfect rep!",
  "You got this!",
  "Power through!",
];

const ActiveWorkout: React.FC = () => {
  const { exerciseType } = useParams<{ exerciseType: ExerciseType }>();
  const exercise = exerciseType as ExerciseType;
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [phase, setPhase] = useState<'loading' | 'active' | 'done'>('loading');
  const [reps, setReps] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [feedback, setFeedback] = useState("Initializing AI...");
  const [simState, setSimState] = useState<'up' | 'down'>('up');

  const { user } = useAuth();
  const navigate = useNavigate();
  const poseLandmarkerRef = useRef<any>(null);
  const repCounterRef = useRef<RepCounter>(new RepCounter(exercise));
  const requestRef = useRef<number | undefined>(undefined);
  const timerRef = useRef<any>(undefined);
  const feedbackIdx = useRef(0);
  const calories = calculateCalories(exercise, reps, elapsed);

  useEffect(() => {
    const initWorkout = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (videoRef.current) videoRef.current.srcObject = stream;

        const landmarker = await PoseVision.getInstance();
        poseLandmarkerRef.current = landmarker;

        setPhase('active');
        setFeedback("AI Active - Start your set!");
        startTracking();

        timerRef.current = setInterval(() => {
          setElapsed(prev => prev + 1);
        }, 1000);
      } catch (err) {
        console.error("Failed to init workout:", err);
        setFeedback("Camera error. Please check permissions.");
      }
    };

    initWorkout();

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach(track => track.stop());
    };
  }, []);

  const startTracking = () => {
    const track = async () => {
      if (!videoRef.current || !poseLandmarkerRef.current || !isActive || phase !== 'active') {
        requestRef.current = requestAnimationFrame(track);
        return;
      }

      if (videoRef.current.readyState >= 2) {
        const results = poseLandmarkerRef.current.detectForVideo(videoRef.current, performance.now());

        if (results.landmarks && results.landmarks.length > 0) {
          const prevReps = reps;
          const currentReps = repCounterRef.current.update(results.landmarks[0], exercise);

          if (currentReps > prevReps) {
            handleRepCount(currentReps);
          }

          const ctx = canvasRef.current?.getContext('2d');
          if (ctx && canvasRef.current) {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          }
        }
      }
      requestRef.current = requestAnimationFrame(track);
    };
    requestRef.current = requestAnimationFrame(track);
  };

  const handleRepCount = useCallback((newReps: number) => {
    setReps(newReps);
    feedbackIdx.current = (feedbackIdx.current + 1) % FEEDBACK_MESSAGES.length;
    setFeedback(`${FEEDBACK_MESSAGES[feedbackIdx.current]} — Rep ${newReps}`);
    setSimState(prev => prev === 'up' ? 'down' : 'up');

    const feedbackEl = document.getElementById('feedback-bubble');
    if (feedbackEl) {
      feedbackEl.style.transform = 'scale(1.1)';
      setTimeout(() => { feedbackEl.style.transform = 'scale(1)'; }, 150);
    }
  }, [exercise, elapsed]);

  const countRepManual = () => {
    if (!isActive) return;
    handleRepCount(reps + 1);
  };

  const handleFinish = async () => {
    if (!user) return;
    setIsActive(false);
    if (timerRef.current) clearInterval(timerRef.current);

    await saveWorkoutSession({
      userId: user.uid,
      exercise: exercise,
      reps: reps,
      calories,
      duration: elapsed,
      timestamp: new Date()
    });

    setPhase('done');
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  if (phase === 'done') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#050B15', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
        <div style={{ background: 'rgba(55, 233, 192, 0.1)', width: '100px', height: '100px', borderRadius: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <CheckCircle size={56} color="#37E9C0" />
        </div>
        <h1 className="glow-text" style={{ fontSize: '2rem', color: '#37E9C0', marginBottom: '0.5rem' }}>Workout Complete!</h1>
        <p style={{ color: '#94A3B8', fontSize: '1.1rem', marginBottom: '2rem', textTransform: 'capitalize' }}>{EXERCISE_INFO[exercise].name} Session</p>

        <div className="glass-container" style={{ width: '100%', maxWidth: '400px', padding: '2rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
          <div>
            <span style={{ color: '#94A3B8', fontSize: '0.8rem', fontWeight: '600' }}>{exercise === 'plank' ? 'HELD' : 'REPS'}</span>
            <h2 style={{ margin: 0, fontSize: '1.75rem', color: '#37E9C0' }}>{reps}</h2>
          </div>
          <div>
            <span style={{ color: '#94A3B8', fontSize: '0.8rem', fontWeight: '600' }}>KCAL</span>
            <h2 style={{ margin: 0, fontSize: '1.75rem', color: '#ef4444' }}>{calories.toFixed(1)}</h2>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <span style={{ color: '#94A3B8', fontSize: '0.8rem', fontWeight: '600' }}>DURATION</span>
            <h2 style={{ margin: 0, fontSize: '1.75rem', color: 'white' }}>{formatTime(elapsed)}</h2>
          </div>
        </div>

        <button className="neon-button" style={{ width: '100%', maxWidth: '400px' }} onClick={() => navigate('/dashboard')}>
           RETURN TO DASHBOARD
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#050B15', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
        />
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', transform: 'scaleX(-1)', zIndex: 5 }}
        />

        {/* Overlays */}
        <div style={{ position: 'absolute', top: '1.5rem', left: '1rem', right: '1rem', display: 'flex', justifyContent: 'space-between', zIndex: 20 }}>
          <button onClick={() => navigate('/dashboard')} style={{ background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', padding: '0.5rem' }}>
            <X color="white" size={24} />
          </button>
          <div className="glass-container" style={{ padding: '0.5rem 1rem', borderRadius: '999px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
             <Trophy size={16} color="#37E9C0" />
             <span style={{ color: 'white', fontWeight: '700', textTransform: 'capitalize' }}>{EXERCISE_INFO[exercise].name}</span>
          </div>
          <div style={{ width: 40 }} />
        </div>

        <div style={{ position: 'absolute', top: '5rem', left: '1rem', right: '1rem', display: 'flex', gap: '0.75rem', zIndex: 20 }}>
          <div className="glass-container" style={{ flex: 1, padding: '1rem', textAlign: 'center' }}>
            <Zap color="#37E9C0" size={20} style={{ margin: '0 auto' }} />
            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#37E9C0' }}>{reps}</div>
            <div style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: '700' }}>{exercise === 'plank' ? 'SEC' : 'REPS'}</div>
          </div>
          <div className="glass-container" style={{ flex: 1, padding: '1rem', textAlign: 'center' }}>
            <Flame color="#ef4444" size={20} style={{ margin: '0 auto' }} />
            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'white' }}>{calories.toFixed(1)}</div>
            <div style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: '700' }}>KCAL</div>
          </div>
          <div className="glass-container" style={{ flex: 1, padding: '1rem', textAlign: 'center' }}>
            <Loader2 color="#11C8FF" size={20} className={isActive ? "animate-spin" : ""} style={{ margin: '0 auto' }} />
            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'white' }}>{formatTime(elapsed)}</div>
            <div style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: '700' }}>TIME</div>
          </div>
        </div>

        <div style={{ position: 'absolute', top: '13rem', left: '1rem', right: '1rem', display: 'flex', flexWrap: 'wrap', gap: '8px', zIndex: 20 }}>
          {EXERCISE_INFO[exercise].tips.map((tip, i) => (
            <div key={i} style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', color: 'white', backdropFilter: 'blur(4px)' }}>
              {tip}
            </div>
          ))}
        </div>

        <div style={{ position: 'absolute', right: '1.5rem', bottom: '12rem', zIndex: 20 }}>
            <div className="glass-container" style={{ padding: '1rem', borderRadius: '20px' }}>
                <PoseVisualizer exercise={exercise} state={simState} color="#37E9C0" />
            </div>
        </div>

        <div id="feedback-bubble" style={{ position: 'absolute', bottom: '8rem', left: '2rem', right: '2rem', display: 'flex', justifyContent: 'center', zIndex: 20, transition: 'transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
           <div style={{ background: 'rgba(55, 233, 192, 0.95)', padding: '0.75rem 1.5rem', borderRadius: '1.5rem', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
              <p style={{ margin: 0, color: '#050B15', fontWeight: '800', fontSize: '1rem' }}>{feedback}</p>
           </div>
        </div>

        {exercise !== 'plank' && (
          <div style={{ position: 'absolute', bottom: '2rem', left: '2rem', right: '2rem', zIndex: 20 }}>
            <button
              onClick={countRepManual}
              disabled={!isActive}
              className="neon-button"
              style={{ width: '100%', background: isActive ? 'var(--primary)' : 'rgba(255,255,255,0.1)', opacity: isActive ? 1 : 0.6 }}
            >
              {isActive ? "TAP = 1 REP" : "RESUME TO COUNT"}
            </button>
          </div>
        )}

        {phase === 'loading' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#050B15', zIndex: 100 }}>
            <Loader2 className="animate-spin" size={48} color="#37E9C0" />
            <p style={{ marginTop: '1rem', color: '#37E9C0', fontWeight: '600' }}>Calibrating AI Pose Engine...</p>
          </div>
        )}
      </div>

      <div style={{ background: '#050B15', padding: '1.5rem 2rem', display: 'flex', gap: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <button
          onClick={() => setIsActive(!isActive)}
          style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '1rem', width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}
        >
          {isActive ? <Pause size={32} /> : <Play size={32} />}
        </button>
        <button onClick={handleFinish} className="neon-button" style={{ flex: 1, height: '64px', background: '#ef4444', color: 'white' }}>
          <Square size={20} fill="white" />
          FINISH SESSION
        </button>
      </div>
    </div>
  );
};

export default ActiveWorkout;
