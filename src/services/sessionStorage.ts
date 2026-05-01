import { Preferences } from '@capacitor/preferences';

const USER_SESSION_KEY = 'user';

export interface StoredSession {
  userId: string;
  token?: string;
  email?: string;
}

export const saveUserSession = async (session: StoredSession) => {
  await Preferences.set({
    key: USER_SESSION_KEY,
    value: JSON.stringify(session),
  });
};

export const getUserSession = async (): Promise<StoredSession | null> => {
  const { value } = await Preferences.get({ key: USER_SESSION_KEY });

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as StoredSession;
  } catch {
    return null;
  }
};

export const clearUserSession = async () => {
  await Preferences.remove({ key: USER_SESSION_KEY });
};