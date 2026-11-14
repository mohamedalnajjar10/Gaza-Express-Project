import type { Session } from '../auth/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
let session: Session | null = null;
let rotation: Promise<Session> | undefined;
export const getSession = () => session;
export function setSession(value: Session | null) {
  session = value;
}
async function request<T>(
  path: string,
  init: RequestInit,
  access?: string,
  responseType: 'json' | 'blob' = 'json',
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  if (access) headers.set('Authorization', `Bearer ${access}`);
  const timeout = AbortSignal.timeout(15000);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout;
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers,
    credentials: 'same-origin',
    signal,
  });
  if (response.status === 204) return undefined as T;
  if (response.ok && responseType === 'blob') return await response.blob() as T;
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
  responseType: 'json' | 'blob' = 'json',
): Promise<T> {
  const previous = authenticated ? session : null;
  try {
    return await request<T>(path, init, previous?.access_token, responseType);
  } catch (error) {
    if (
      !(error instanceof ApiError) ||
      error.status !== 401 ||
      !previous ||
      path.startsWith('/auth/')
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
      .catch(reason => {
        if (
          session === previous &&
          reason instanceof ApiError &&
          reason.status === 401
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
