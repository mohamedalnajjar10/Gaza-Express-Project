import { type ExecutionContext, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuthGuard } from './google-auth.guard';

function requestContext(path: string, headers = {}, query = {}) {
  const response = { cookie: jest.fn(), clearCookie: jest.fn() };
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ path, headers, query }), getResponse: () => response }),
  } as unknown as ExecutionContext;
  return { context, response };
}

describe('Google OAuth state', () => {
  it('does not start the OAuth flow when disabled', () => {
    const guard = new GoogleAuthGuard(new ConfigService({ GOOGLE_AUTH_ENABLED: 'false' }));
    expect(() => guard.canActivate(requestContext('/api/v1/auth/google').context)).toThrow(NotFoundException);
  });

  it('sets an unpredictable host-bound state cookie in production', () => {
    const guard = new GoogleAuthGuard(new ConfigService({ NODE_ENV: 'production', GOOGLE_AUTH_ENABLED: 'true' }));
    const { context, response } = requestContext('/api/v1/auth/google');
    const { state } = guard.getAuthenticateOptions(context);
    expect(state).toMatch(/^[a-f0-9]{64}$/);
    expect(response.cookie).toHaveBeenCalledWith('__Host-wasla_google_state', state, expect.objectContaining({ path: '/', httpOnly: true, secure: true, sameSite: 'lax' }));
    expect(guard.getAuthenticateOptions(context).state).not.toBe(state);
  });

  it('rejects a callback with mismatched state before contacting Google', () => {
    const guard = new GoogleAuthGuard(new ConfigService({ NODE_ENV: 'test', GOOGLE_AUTH_ENABLED: 'true' }));
    const { context, response } = requestContext('/api/v1/auth/google/callback', { cookie: `wasla_google_state=${'a'.repeat(64)}` }, { state: 'b'.repeat(64) });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(response.clearCookie).toHaveBeenCalled();
  });
});
