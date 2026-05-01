import type { ExerciseType } from '../types';

export interface ExerciseInfo {
  name: string;
  description: string;
  icon: string;
  muscleGroups: string[];
  met: number;
  repCalories: number;
  tips: string[];
}

export const EXERCISE_INFO: Record<ExerciseType, ExerciseInfo> = {
  pushups: {
    name: 'Pushups',
    description: 'Classic chest and tricep exercise',
    icon: 'activity',
    muscleGroups: ['Chest', 'Triceps', 'Shoulders'],
    met: 8.0,
    repCalories: 0.28,
    tips: ['Keep back straight', 'Elbows at 45°', 'Full range of motion'],
  },
  squats: {
    name: 'Squats',
    description: 'Fundamental lower body strength',
    icon: 'user',
    muscleGroups: ['Quads', 'Glutes', 'Hamstrings'],
    met: 5.0,
    repCalories: 0.2,
    tips: ['Weight on heels', 'Chest up', 'Knees out'],
  },
  plank: {
    name: 'Plank',
    description: 'Core stability and isometric hold',
    icon: 'shield',
    muscleGroups: ['Abs', 'Back', 'Shoulders'],
    met: 3.3,
    repCalories: 0.02,
    tips: ['Tighten core', 'Don\'t sag hips', 'Look at floor'],
  },
  lunges: {
    name: 'Lunges',
    description: 'Unilateral leg and balance work',
    icon: 'navigation',
    muscleGroups: ['Quads', 'Glutes'],
    met: 4.8,
    repCalories: 0.22,
    tips: ['90° knee angle', 'Stay upright', 'Push through heel'],
  },
  situps: {
    name: 'Situps',
    description: 'Core and abdominal strength',
    icon: 'activity',
    muscleGroups: ['Abs', 'Hip Flexors'],
    met: 4.0,
    repCalories: 0.18,
    tips: ['Control descent', 'Engage abs', 'Exhale on way up'],
  },
  jumpingJacks: {
    name: 'Jumping Jacks',
    description: 'Full body cardio',
    icon: 'activity',
    muscleGroups: ['Full Body'],
    met: 8.0,
    repCalories: 0.12,
    tips: ['Stay on toes', 'Soft landings', 'Full arm swing'],
  },
  burpees: {
    name: 'Burpees',
    description: 'High intensity full body',
    icon: 'activity',
    muscleGroups: ['Full Body'],
    met: 10.0,
    repCalories: 0.4,
    tips: ['Explosive jump', 'Tight plank', 'Smooth transition'],
  },
  mountainClimbers: {
    name: 'Mountain Climbers',
    description: 'Dynamic core and cardio',
    icon: 'activity',
    muscleGroups: ['Abs', 'Shoulders', 'Quads'],
    met: 8.0,
    repCalories: 0.14,
    tips: ['Running motion', 'Keep hips low', 'Stable shoulders'],
  },
  highKnees: {
    name: 'High Knees',
    description: 'Intense cardio and hip mobility',
    icon: 'activity',
    muscleGroups: ['Quads', 'Abs', 'Glutes'],
    met: 8.0,
    repCalories: 0.12,
    tips: ['Knees to hip height', 'Pump arms', 'Quick feet'],
  },
  bicycleCrunches: {
    name: 'Bicycle Crunches',
    description: 'Oblique focused core work',
    icon: 'activity',
    muscleGroups: ['Abs', 'Obliques'],
    met: 4.0,
    repCalories: 0.15,
    tips: ['Elbow to knee', 'Rotate torso', 'Extend legs fully'],
  },
};

export function calculateCalories(exercise: ExerciseType, reps: number, duration: number, weight: number = 70) {
  const info = EXERCISE_INFO[exercise];
  const durationHours = duration / 3600;
  const durationCalories = info.met * weight * durationHours;
  const repCalories = Math.max(0, reps) * info.repCalories * (weight / 70);
  return durationCalories + repCalories;
}
