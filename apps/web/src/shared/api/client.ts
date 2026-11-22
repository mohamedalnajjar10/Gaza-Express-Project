import type { Session } from '../auth/types';

type ResponseType = 'json' | 'blob' | 'event-stream';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
const sessionKey = 'gaza-express.session.v1';

function readSession(): Session | null {
  try {
    const saved: unknown = JSON.parse(
      sessionStorage.getItem(sessionKey) || 'null',
    );
    if (
      saved &&
      typeof saved === 'object' &&
      'access_token' in saved &&
      typeof saved.access_token === 'string' &&
      saved.access_token &&
      'refresh_token' in saved &&
      typeof saved.refresh_token === 'string' &&
      saved.refresh_token
    ) {
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
let rotation: Promise<Session> | undefined;
export const getSession = () => session;
export function setSession(value: Session | null) {
  session = value;
  try {
    if (value) sessionStorage.setItem(sessionKey, JSON.stringify(value));
    else sessionStorage.removeItem(sessionKey);
  } catch {
    // Keep the in-memory session usable if browser storage is unavailable.
  }
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
  if (!response.ok || body?.success !== true)
    throw new ApiError(
      response.status,
      Array.isArray(body?.message)
        ? body.message.join('، ')
        : body?.message || 'تعذّر الاتصال بالخدمة. حاول مرة أخرى.',
      Number.isSafeInteger(retryAfter) && retryAfter > 0
        ? retryAfter
        : undefined,
    );
  return body.data as T;
}
export async function api<T>(
  path: string,
  init: RequestInit = {},
  authenticated = true,
  responseType: ResponseType = 'json',
): Promise<T> {
  const previous = authenticated ? session : null;
  try {
    return await request<T>(path, init, previous?.access_token, responseType);
  } catch (error) {
    if (
      !(error instanceof ApiError) ||
      error.status !== 401 ||
      !previous ||
      (path.startsWith('/auth/') && path !== '/auth/profile')
    )
      throw error;
    if (!session) throw error;
    if (session !== previous)
      return request<T>(path, init, session.access_token, responseType);
    rotation ??= request<{ tokens: Session }>(
      '/auth/refresh',
      json('POST', { refresh_token: previous.refresh_token }),
    )
      .then(({ tokens }) => {
        if (session === previous) setSession(tokens);
        return tokens;
      })
      .catch((reason) => {
        if (
          session === previous &&
          reason instanceof ApiError &&
          (reason.status === 401 || reason.status === 403)
        ) {
          setSession(null);
          window.dispatchEvent(new Event('session-expired'));
        }
        throw reason;
      })
      .finally(() => {
        rotation = undefined;
      });
    const next = await rotation;
    if (session !== next) throw error;
    return request<T>(path, init, next.access_token, responseType);
  }
}
export const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});
