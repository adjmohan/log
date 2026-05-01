import { db } from '../firebase/config';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp
} from 'firebase/firestore';
import type { UserProfile, WorkoutSession } from '../types';

export const createUserProfile = async (uid: string, profile: Partial<UserProfile>) => {
  const userRef = doc(db, "users", uid);
  return await setDoc(userRef, {
    uid,
    faceEmbedding: null,
    onboardingComplete: false,
    createdAt: Timestamp.now(),
    ...profile,
  });
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const docRef = doc(db, "users", uid);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return docSnap.data() as UserProfile;
  }
  return null;
};

export const updateFaceEmbedding = async (userId: string, embedding: number[]) => {
  const docRef = doc(db, 'users', userId);
  await updateDoc(docRef, {
    faceEmbedding: embedding,
    onboardingComplete: true,
    updatedAt: Timestamp.now()
  });
};

export const updateUserProfile = async (uid: string, profile: Partial<UserProfile>) => {
  const userRef = doc(db, "users", uid);
  return await updateDoc(userRef, {
    ...profile,
    updatedAt: Timestamp.now()
  });
};

export const saveWorkoutSession = async (session: WorkoutSession) => {
  return await addDoc(collection(db, "workouts"), {
    ...session,
    timestamp: Timestamp.now()
  });
};

export const getWorkoutSessions = async (uid: string) => {
  const q = query(
    collection(db, "workouts"),
    where("userId", "==", uid),
    orderBy("timestamp", "desc")
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as unknown as WorkoutSession);
};

export const getWorkoutHistory = getWorkoutSessions;
