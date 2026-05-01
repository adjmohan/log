import { TrendingUp, User, Navigation, Shield, Check, ChevronDown, Activity, Zap, Flame, MoveUp } from "lucide-react";
import { EXERCISE_INFO } from "../utils/calories";
import type { ExerciseType } from "../types";

interface ExerciseCardProps {
  type: ExerciseType;
  selected?: boolean;
  onSelect: (type: ExerciseType) => void;
}

const getIcon = (type: ExerciseType, selected: boolean) => {
  const size = 20;
  const color = selected ? 'var(--primary-foreground)' : 'var(--primary)';
  switch (type) {
    case 'pushups': return <TrendingUp size={size} color={color} />;
    case 'squats': return <ChevronDown size={size} color={color} />;
    case 'lunges': return <Navigation size={size} color={color} style={{ transform: 'rotate(180deg)' }} />;
    case 'plank': return <Shield size={size} color={color} />;
    case 'situps': return <Activity size={size} color={color} />;
    case 'jumpingJacks': return <Zap size={size} color={color} />;
    case 'burpees': return <Flame size={size} color={color} />;
    case 'mountainClimbers': return <MoveUp size={size} color={color} />;
    case 'highKnees': return <Activity size={size} color={color} />;
    case 'bicycleCrunches': return <Activity size={size} color={color} />;
    default: return <User size={size} color={color} />;
  }
};

export function ExerciseCard({ type, selected, onSelect }: ExerciseCardProps) {
  const info = EXERCISE_INFO[type];

  return (
    <div
      onClick={() => onSelect(type)}
      style={{
        padding: '20px',
        borderRadius: '24px',
        border: `2px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
        backgroundColor: selected ? 'rgba(55, 233, 192, 0.05)' : 'var(--card)',
        cursor: 'pointer',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        flex: 1,
        minWidth: '150px',
        position: 'relative'
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '14px',
          backgroundColor: selected ? 'var(--primary)' : 'rgba(55, 233, 192, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s'
        }}>
          {getIcon(type, selected)}
        </div>
        {selected && (
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            backgroundColor: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Check size={14} color="var(--primary-foreground)" strokeWidth={3} />
          </div>
        )}
      </div>

      <div>
        <h3 style={{
          fontSize: '18px',
          fontWeight: '700',
          color: 'white',
          margin: '0 0 4px'
        }}>
          {info.name}
        </h3>
        <p style={{
          fontSize: '13px',
          color: 'var(--muted-foreground)',
          lineHeight: '1.4',
          margin: 0
        }}>
          {info.description}
        </p>
      </div>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        marginTop: 'auto'
      }}>
        {info.muscleGroups.map((m) => (
          <span
            key={m}
            style={{
              padding: '4px 10px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: '500',
              color: '#94A3B8'
            }}
          >
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}
