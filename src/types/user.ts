export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone: string;
  faceEmbedding: number[] | null;
  age: number;
  weight: number;
  height: number;
  goal?: string;
  profileImageUri?: string;
  onboardingComplete: boolean;
  createdAt: any;
  updatedAt?: any;
}

export interface WorkoutSession {
  id?: string;
  userId: string;
  exercise: string;
  reps: number;
  calories: number;
  duration: number;
  timestamp: any;
}
