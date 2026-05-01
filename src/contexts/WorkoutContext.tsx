import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "./AuthContext";
import type { ExerciseType } from "../types";
import { getUserProfile, saveWorkoutSession, getWorkoutHistory } from "../api/db";

export interface WorkoutSession {
  id: string;
  date: string;
  exercise: ExerciseType;
  reps: number;
  duration: number;
  calories: number;
  userWeight: number;
}

export interface UserProfile {
  name: string;
  weight: number;
  height: number;
  age: number;
  goal: string;
  profileImageUri?: string;
}

interface WorkoutContextType {
  sessions: WorkoutSession[];
  userProfile: UserProfile;
  totalCaloriesToday: number;
  totalRepsToday: number;
  weeklyCalories: number[];
  addSession: (session: Omit<WorkoutSession, 'id'>) => Promise<void>;
  updateProfile: (profile: Partial<UserProfile>) => void;
  getTodaySessions: () => WorkoutSession[];
  refreshData: () => Promise<void>;
}

const defaultProfile: UserProfile = {
  name: "Athlete",
  weight: 70,
  height: 175,
  age: 25,
  goal: "Build Muscle",
  profileImageUri: "",
};

const WorkoutContext = createContext<WorkoutContextType | null>(null);

export function WorkoutProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile>(defaultProfile);

  const refreshData = async () => {
    if (!user) return;
    try {
      const history = await getWorkoutHistory(user.uid);
      const mappedHistory: WorkoutSession[] = history.map((s: any) => ({
        id: s.id,
        date: s.timestamp.toISOString ? s.timestamp.toISOString() : new Date(s.timestamp.seconds * 1000).toISOString(),
        exercise: s.exercise as ExerciseType,
        reps: s.reps,
        duration: s.duration,
        calories: s.calories,
        userWeight: 70 // Default if not in session
      }));
      setSessions(mappedHistory);

      const profile = await getUserProfile(user.uid);
      if (profile) {
        setUserProfile({
            ...defaultProfile,
            name: profile.displayName || defaultProfile.name,
            weight: profile.weight || defaultProfile.weight,
            height: profile.height || defaultProfile.height,
            age: profile.age || defaultProfile.age,
            goal: profile.goal || defaultProfile.goal
        });
      }
    } catch (error) {
      console.error("Error loading workout data:", error);
    }
  };

  useEffect(() => {
    refreshData();
  }, [user]);

  const addSession = async (sessionData: Omit<WorkoutSession, 'id'>) => {
    if (!user) return;
    try {
      await saveWorkoutSession({
        userId: user.uid,
        ...sessionData,
        timestamp: new Date(sessionData.date)
      });
      await refreshData();
    } catch (error) {
      console.error("Error adding session:", error);
    }
  };

  const updateProfile = (profile: Partial<UserProfile>) => {
    setUserProfile(prev => ({ ...prev, ...profile }));
    // Note: Profile update persistence logic would go here (api call)
  };

  const getTodaySessions = () => {
    const today = new Date().toDateString();
    return sessions.filter((s) => new Date(s.date).toDateString() === today);
  };

  const totalCaloriesToday = getTodaySessions().reduce(
    (sum, s) => sum + s.calories,
    0
  );

  const totalRepsToday = getTodaySessions().reduce(
    (sum, s) => sum + s.reps,
    0
  );

  const weeklyCalories = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toDateString();
    return sessions
      .filter((s) => new Date(s.date).toDateString() === dateStr)
      .reduce((sum, s) => sum + s.calories, 0);
  });

  return (
    <WorkoutContext.Provider
      value={{
        sessions,
        userProfile,
        totalCaloriesToday,
        totalRepsToday,
        weeklyCalories,
        addSession,
        updateProfile,
        getTodaySessions,
        refreshData
      }}
    >
      {children}
    </WorkoutContext.Provider>
  );
}

export function useWorkout() {
  const ctx = useContext(WorkoutContext);
  if (!ctx) throw new Error("useWorkout must be used within WorkoutProvider");
  return ctx;
}
