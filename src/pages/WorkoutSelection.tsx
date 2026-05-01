import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExerciseCard } from '../components/ExerciseCard';
import { KeyboardAwareScrollViewCompat } from '../components/KeyboardAwareScrollViewCompat';
import type { ExerciseType } from '../types';

const WORKOUTS: ExerciseType[] = [
  "pushups",
  "squats",
  "plank",
  "lunges",
  "situps",
  "jumpingJacks",
  "burpees",
  "mountainClimbers",
  "highKnees",
  "bicycleCrunches",
];

const WorkoutSelection: React.FC = () => {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<ExerciseType | null>(null);

  const handleStart = () => {
    if (selected) {
      // Go directly to live tracking, bypassing the security gate if requested
      navigate(`/live-tracking/${selected}`);
    }
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--background)'
    }}>
      <KeyboardAwareScrollViewCompat style={{ padding: '24px' }}>
        <header style={{ marginBottom: '32px' }}>
          <h1 className="glow-text" style={{
            fontSize: '32px',
            fontWeight: 700,
            margin: '0 0 8px',
            color: 'var(--foreground)'
          }}>
            Choose Your Workout
          </h1>
          <p style={{ color: 'var(--muted-foreground)', margin: 0, fontSize: '16px' }}>
            AI-powered form tracking for maximum efficiency
          </p>
        </header>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: '16px',
          marginBottom: '100px'
        }}>
          {WORKOUTS.map((type) => (
            <ExerciseCard
              key={type}
              type={type}
              selected={selected === type}
              onSelect={(t) => setSelected(t)}
            />
          ))}
        </div>
      </KeyboardAwareScrollViewCompat>

      {selected && (
        <div style={{
          position: 'fixed',
          bottom: '100px',
          left: '24px',
          right: '24px',
          zIndex: 50
        }}>
          <button
            onClick={handleStart}
            className="neon-button animate-fade-in"
            style={{ width: '100%', height: '56px', fontSize: '18px' }}
          >
            Start {selected.charAt(0).toUpperCase() + selected.slice(1)}
          </button>
        </div>
      )}
    </div>
  );
};

export default WorkoutSelection;
