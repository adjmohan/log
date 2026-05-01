import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, sendPasswordResetEmail, type User } from 'firebase/auth';
import { auth } from '../firebase/config';
import { clearUserSession, saveUserSession } from '../services/sessionStorage';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  sendPasswordReset: (email: string) => Promise<{ sent: boolean }>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  sendPasswordReset: async () => ({ sent: false })
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const sendPasswordReset = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      return { sent: true };
    } catch (error) {
      console.error('Error sending password reset email:', error);
      throw error;
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);

      if (user) {
        const token = await user.getIdToken().catch(() => '');
        await saveUserSession({
          userId: user.uid,
          token,
          email: user.email ?? '',
        });
      } else {
        await clearUserSession();
      }

      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, sendPasswordReset }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
