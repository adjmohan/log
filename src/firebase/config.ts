import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAWjJiYoGHYQHUsdAgNwBw16_qLNxXZfvw",
  authDomain: "final-7930b.firebaseapp.com",
  projectId: "final-7930b",
  storageBucket: "final-7930b.firebasestorage.app",
  messagingSenderId: "8726660900",
  appId: "1:8726660900:web:e6dbf39d958da2290555b1",
  measurementId: "G-E2GX4NLNWD"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
