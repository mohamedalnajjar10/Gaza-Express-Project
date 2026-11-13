import { ExecutionContext, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';

export const googleStateCookie = 'wasla_google_state';
export const googleExchangeCookie = 'wasla_google_exchange';

export function oauthCookie(config: ConfigService, name: string, path: string) {
  const secure = config.get('NODE_ENV') === 'production';
  return { name: secure ? `__Host-${name}` : name, options: { path: secure ? '/' : path, secure, httpOnly: true, sameSite: 'lax' as const } };
}

export function readOAuthCookie(request: Request, name: string) {
  const prefix = `${name}=`;
  const value = request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(prefix))?.slice(prefix.length);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly config: ConfigService) { super(); }

  canActivate(context: ExecutionContext) {
    if (this.config.get('GOOGLE_AUTH_ENABLED') !== 'true') throw new NotFoundException();
    const request = context.switchToHttp().getRequest<Request>();
    if (request.path.endsWith('/callback')) {
      const response = context.switchToHttp().getResponse<Response>();
      const state = request.query.state;
      const cookie = oauthCookie(this.config, googleStateCookie, request.path);
      const expected = readOAuthCookie(request, cookie.name);
      response.clearCookie(cookie.name, cookie.options);
      if (!expected || typeof state !== 'string' || !/^[a-f0-9]{64}$/.test(state) || !timingSafeEqual(Buffer.from(expected), Buffer.from(state))) {
        throw new UnauthorizedException('Invalid OAuth state');
      }
    }
    return super.canActivate(context);
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.path.endsWith('/callback')) return {};
    const response = context.switchToHttp().getResponse<Response>();
    const state = randomBytes(32).toString('hex');
    const cookie = oauthCookie(this.config, googleStateCookie, `${request.path}/callback`);
    response.cookie(cookie.name, state, { ...cookie.options, maxAge: 300000 });
    return { state };
  }
}
