import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ThrottlerGuard, type ThrottlerLimitDetail, type ThrottlerModuleOptions,
} from '@nestjs/throttler';
import { createHash } from 'node:crypto';
import type { Response } from 'express';
import { AuthController } from '../auth/auth.controller';
import { AUTH_CONSTANTS } from '../auth/constants/auth.constants';
import { RedisStorage } from './redis.module';

const auth = AuthController.prototype;
const credentials = {
  scope: 'credentials', limit: AUTH_CONSTANTS.MAX_LOGIN_ATTEMPTS,
  ttl: AUTH_CONSTANTS.LOGIN_BLOCK_SECONDS * 1000,
};
const otp = {
  scope: 'otp', limit: AUTH_CONSTANTS.MAX_OTP_ATTEMPTS,
  ttl: AUTH_CONSTANTS.OTP_BLOCK_SECONDS * 1000,
};
const refresh = { scope: 'refresh', limit: 20, ttl: 60_000 };
const authPolicies = new Map<object, { scope: string; limit: number; ttl: number }>([
  [auth.register, credentials], [auth.login, credentials],
  [auth.verifyOtp, otp], [auth.resendOtp, otp],
  [auth.refreshToken, refresh],
]);
const authPolicy = (context: ExecutionContext) => authPolicies.get(context.getHandler());
const keyFor = (scope: string, ip: string) =>
  createHash('sha256').update(`v2:${scope}:${ip}`).digest('hex');

export function rateLimitOptions(config: ConfigService, storage: RedisStorage): ThrottlerModuleOptions {
  const benchmark = config.get('LOAD_TEST_MODE') === '1';
  return {
    storage,
    throttlers: [
      {
        name: 'default',
        ttl: Number(config.get('RATE_LIMIT_TTL', 60_000)),
        limit: Number(config.get('RATE_LIMIT_MAX_REQUESTS', 300)),
        skipIf: () => benchmark,
        generateKey: (_context, ip) => keyFor('api', ip),
      },
      {
        name: 'auth',
        ttl: context => authPolicy(context)!.ttl,
        limit: context => authPolicy(context)!.limit,
        skipIf: context => benchmark || !authPolicy(context),
        generateKey: (context, ip) => keyFor(authPolicy(context)!.scope, ip),
      },
    ],
  };
}

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected override async throwThrottlingException(context: ExecutionContext, detail: ThrottlerLimitDetail) {
    context.switchToHttp().getResponse<Response>().setHeader('Retry-After', detail.timeToBlockExpire);
    return super.throwThrottlingException(context, detail);
  }
}
