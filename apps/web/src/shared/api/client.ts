import type { Session } from '../auth/types';

type ResponseType = 'json' | 'blob' | 'event-stream';

const DEFAULT_API_ERROR = 'تعذّر الاتصال بالخدمة. حاول مرة أخرى.';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterSeconds?: number,
    public hasServerMessage = true,
  ) {
    super(message);
  }
}

const sessionKey = 'gaza-express.session.v1';
const sessionSyncKey = 'gaza-express.session-sync.v1';
const tabId = typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : String(Math.random());

function isValidSession(saved: unknown): saved is Session {
  return Boolean(
    saved &&
    typeof saved === 'object' &&
    'access_token' in saved &&
    typeof saved.access_token === 'string' &&
    saved.access_token &&
    'refresh_token' in saved &&
    typeof saved.refresh_token === 'string' &&
    saved.refresh_token,
  );
}

function readSession(): Session | null {
  try {
    const saved: unknown = JSON.parse(
      sessionStorage.getItem(sessionKey) || 'null',
    );
    if (isValidSession(saved)) {
      return {
        access_token: saved.access_token,
        refresh_token: saved.refresh_token,
      };
    }
    sessionStorage.removeItem(sessionKey);
  } catch {
    // Storage may be disabled. Authentication still works for this page lifetime.
  }
  return null;
}

let session: Session | null = readSession();
let identityVersion = 0;
let rotation: Promise<Session> | undefined;

function writeSessionStorage(value: Session | null) {
  try {
    if (value) sessionStorage.setItem(sessionKey, JSON.stringify(value));
    else sessionStorage.removeItem(sessionKey);
  } catch {
    // Keep the in-memory session usable if browser storage is unavailable.
  }
}

function applySyncedSession(value: Session | null, previous?: string) {
  if (!session || session.refresh_token !== previous) return;
  if (value === null) identityVersion++;
  session = value;
  writeSessionStorage(value);
  if (value === null) {
    window.dispatchEvent(new Event('session-expired'));
  }
}

const channel = typeof BroadcastChannel !== 'undefined'
  ? (() => {
      try {
        return new BroadcastChannel(sessionKey);
      } catch {
        return undefined;
      }
    })()
  : undefined;

function syncSession(payload: { sender?: string; previous?: string; session?: unknown } | null) {
  if (!payload || payload.sender === tabId) return;
  if (payload.session === null || isValidSession(payload.session)) {
    applySyncedSession(payload.session, payload.previous);
  }
}

channel?.addEventListener('message', event => syncSession(event.data));

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== sessionSyncKey || !event.newValue) return;
    try {
      syncSession(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed storage events.
    }
  });
}

function broadcastSession(value: Session | null, previous: string) {
  try {
    channel?.postMessage({ sender: tabId, previous, session: value });
  } catch {
    // BroadcastChannel may be closed or unavailable.
  }
  try {
    localStorage.setItem(
      sessionSyncKey,
      JSON.stringify({ sender: tabId, previous, session: value, ts: Date.now() }),
    );
    localStorage.removeItem(sessionSyncKey);
  } catch {
    // localStorage may be disabled in restricted browsing modes.
  }
}

export const getSession = () => session;
export function setSession(value: Session | null) {
  identityVersion++;
  if (!value && session) broadcastSession(null, session.refresh_token);
  session = value;
  writeSessionStorage(value);
}

async function request<T>(
  path: string,
  init: RequestInit,
  access?: string,
  responseType: ResponseType = 'json',
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  if (access) headers.set('Authorization', `Bearer ${access}`);
  const timeout = responseType === 'event-stream' ? null : AbortSignal.timeout(15000);
  const signal = timeout && init.signal ? AbortSignal.any([timeout, init.signal]) : timeout ?? init.signal;
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers,
    credentials: 'same-origin',
    signal,
  });
  if (response.status === 204) return undefined as T;
  if (response.ok && responseType === 'blob')
    return (await response.blob()) as T;
  if (response.ok && responseType === 'event-stream') {
    if (response.body && response.headers.get('Content-Type')?.startsWith('text/event-stream')) return response.body as T;
    throw new ApiError(503, 'Live updates unavailable');
  }
  const body = await response.json().catch(() => null);
  const retryAfter = Number(response.headers.get('Retry-After'));
  if (!response.ok || body?.success !== true) {
    const serverMessage = Array.isArray(body?.message)
      ? body.message.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0).join('، ')
      : typeof body?.message === 'string'
        ? body.message.trim()
        : '';
    throw new ApiError(
      response.status,
      serverMessage || DEFAULT_API_ERROR,
      Number.isSafeInteger(retryAfter) && retryAfter > 0
        ? retryAfter
        : undefined,
      Boolean(serverMessage),
    );
  }
  return body.data as T;
}

async function runLockedRefresh(previous: Session): Promise<Session> {
  const perform = async (): Promise<Session> => {
    if (session && session !== previous && session.refresh_token !== previous.refresh_token) {
      return session;
    }
    if (!session) {
      throw new ApiError(401, 'انتهت الجلسة.');
    }
    try {
      const { tokens } = await request<{ tokens: Session }>(
        '/auth/refresh',
        json('POST', { refresh_token: previous.refresh_token }),
      );
      if (session === previous) {
        session = tokens;
        writeSessionStorage(tokens);
        broadcastSession(tokens, previous.refresh_token);
      }
      return tokens;
    } catch (reason) {
      if (
        session === previous &&
        reason instanceof ApiError &&
        (reason.status === 401 || reason.status === 403)
      ) {
        setSession(null);
        window.dispatchEvent(new Event('session-expired'));
      }
      throw reason;
    }
  };
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('gaza-express.refresh', perform);
  }
  return perform();
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
  authenticated = true,
  responseType: ResponseType = 'json',
): Promise<T> {
  const previous = authenticated ? session : null;
  const version = identityVersion;
  async function send(access?: string) {
    const result = await request<T>(path, init, access, responseType);
    if (previous && version !== identityVersion) throw new ApiError(409, 'تغيّر الحساب أثناء الطلب.');
    return result;
  }
  try {
    return await send(previous?.access_token);
  } catch (error) {
    if (
      !(error instanceof ApiError) ||
      error.status !== 401 ||
      !previous ||
      (path.startsWith('/auth/') && path !== '/auth/profile')
    )
      throw error;
    if (!session || version !== identityVersion) throw error;
    if (session !== previous)
      return send(session.access_token);
    rotation ??= runLockedRefresh(previous).finally(() => {
      rotation = undefined;
    });
    const next = await rotation;
    if (session !== next || version !== identityVersion) throw error;
    return send(next.access_token);
  }
}

export const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});
