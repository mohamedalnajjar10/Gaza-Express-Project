import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, setSession, getSession, json } from '../api/client';
import { type Profile, type Session } from './types';

const Identity = createContext<{
  profile: Profile | null;
  establish: (s: Session) => Promise<Profile>;
  logout: () => Promise<void>;
} | null>(null);
export function useIdentity() {
  const identity = useContext(Identity);
  if (!identity) throw new Error('IdentityProvider is required');
  return identity;
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    const expire = () => setProfile(null);
    window.addEventListener('session-expired', expire);
    return () => window.removeEventListener('session-expired', expire);
  }, []);
  async function establish(tokens: Session) {
    setSession(tokens);
    try {
      const profile = await api<Profile>('/auth/profile');
      setProfile(profile);
      return profile;
    } catch (error) {
      setSession(null);
      throw error;
    }
  }
  async function logout() {
    const session = getSession();
    try {
      if (session)
        await api(
          '/auth/logout',
          json('POST', { refresh_token: session.refresh_token }),
        );
    } finally {
      setSession(null);
      setProfile(null);
    }
  }
  return (
    <Identity.Provider value={{ profile, establish, logout }}>
      {children}
    </Identity.Provider>
  );
}
