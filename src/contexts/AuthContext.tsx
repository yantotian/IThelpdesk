import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setAuthToken, getAuthToken } from '@/lib/api-client';
import type { Profile, UserRole } from '@/types/types';

interface AuthUser {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  office: string | null;
  contact: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  profile: Profile | null;
  role: UserRole | null;
  loading: boolean;
  signInWithUsername: (username: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithUsername: (payload: RegisterPayload) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

interface RegisterPayload {
  username: string;
  password: string;
  full_name?: string;
  role?: UserRole;
  office?: string;
  contact?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    if (!user) { setProfile(null); return; }
    try {
      const data = await api.get<Profile>(`/profiles/${user.id}`);
      setProfile(data);
    } catch (error) {
      console.error('Failed to refresh profile:', error);
    }
  };

  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      api.get<{ user: AuthUser }>('/auth/me')
        .then(({ user: userData }) => {
          setUser(userData);
          return api.get<Profile>(`/profiles/${userData.id}`);
        })
        .then((profileData) => {
          setProfile(profileData);
        })
        .catch(() => {
          setAuthToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const signInWithUsername = async (username: string, password: string) => {
    try {
      const data = await api.post<{ token: string; user: AuthUser }>('/auth/login', { username, password });
      setAuthToken(data.token);
      setUser(data.user);
      const profileData = await api.get<Profile>(`/profiles/${data.user.id}`);
      setProfile(profileData);
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signUpWithUsername = async (payload: RegisterPayload) => {
    try {
      const data = await api.post<{ token: string; user: AuthUser }>('/auth/register', payload);
      setAuthToken(data.token);
      setUser(data.user);
      const profileData = await api.get<Profile>(`/profiles/${data.user.id}`);
      setProfile(profileData);
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    setAuthToken(null);
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{
      user, profile,
      role: profile?.role ?? null,
      loading, signInWithUsername, signUpWithUsername, signOut, refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
