import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, setSession, getSession, json } from '../api/client';
import { type Profile, type Session } from './types';
import { Busy, ErrorBox } from '../ui/feedback';

const Identity = createContext<{
  profile: Profile | null;
  establish: (s: Session) => Promise<Profile>;
  logout: () => Promise<void>;
  updateProfile: (data: FormData) => Promise<void>;
  refreshProfile: () => Promise<void>;
} | null>(null);
export function useIdentity() {
  const identity = useContext(Identity);
  if (!identity) throw new Error('IdentityProvider is required');
  return identity;
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [restoring, setRestoring] = useState(() => Boolean(getSession()));
  const [restoreError, setRestoreError] = useState<unknown>();
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  useEffect(() => {
    if (!getSession()) {
      setRestoring(false);
      return;
    }
    let cancelled = false;
    setRestoring(true);
    setRestoreError(undefined);
    void api<Profile>('/auth/profile')
      .then(
        (restored) => {
          if (!cancelled && getSession()) setProfile(restored);
        },
        (error) => {
          if (cancelled) return;
          if (
            error instanceof ApiError &&
            (error.status === 401 || error.status === 403)
          ) {
            setSession(null);
            setProfile(null);
          } else {
            // A temporary network failure must not discard a valid refresh token.
            setRestoreError(error);
          }
        },
      )
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, [restoreAttempt]);
  useEffect(() => {
    const expire = () => setProfile(null);
    window.addEventListener('session-expired', expire);
    return () => window.removeEventListener('session-expired', expire);
  }, []);
  const establish = useCallback(async (tokens: Session) => {
    setSession(tokens);
    try {
      const profile = await api<Profile>('/auth/profile');
      setProfile(profile);
      return profile;
    } catch (error) {
      if (getSession()?.refresh_token === tokens.refresh_token) setSession(null);
      throw error;
    }
  }, []);
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
      setRestoreError(undefined);
    }
  }
  async function updateProfile(data: FormData) {
    const updated = await api<Profile>('/account/profile', {
      method: 'PATCH',
      body: data,
    });
    setProfile((current) =>
      current?.user_id === updated.user_id ? updated : current,
    );
  }
  async function refreshProfile() {
    const updated = await api<Profile>('/auth/profile');
    setProfile(current => getSession() && current?.user_id === updated.user_id ? updated : current);
  }
  return (
    <Identity.Provider value={{ profile, establish, logout, updateProfile, refreshProfile }}>
      {restoring ? (
        <div className="container padded">
          <Busy />
        </div>
      ) : restoreError ? (
        <main className="container narrow">
          <h1>تعذّر استعادة جلسة الدخول</h1>
          <p>تحقق من الاتصال ثم أعد المحاولة.</p>
          <ErrorBox
            error={restoreError}
            retry={() => setRestoreAttempt((value) => value + 1)}
          />
          <button
            className="secondary"
            onClick={() => {
              void logout().catch(() => undefined);
            }}
          >
            تسجيل الخروج
          </button>
        </main>
      ) : (
        children
      )}
    </Identity.Provider>
  );
}
