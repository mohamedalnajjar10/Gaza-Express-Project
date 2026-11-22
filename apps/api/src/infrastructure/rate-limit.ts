import { Injectable, Logger, ServiceUnavailableException, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ThrottlerGuard, type ThrottlerLimitDetail, type ThrottlerModuleOptions, type ThrottlerRequest,
} from '@nestjs/throttler';
import { createHash, createHmac } from 'node:crypto';
import type { Request, Response } from 'express';
import { AuthController } from '../auth/auth.controller';
import { AUTH_CONSTANTS } from '../auth/constants/auth.constants';
import { ProductsController } from '../products/products.controller';
import { StoresController } from '../stores/stores.controller';
import { RedisStorage } from './redis.module';

const auth = AuthController.prototype;
const credentials = {
  scope: 'credentials', limit: 60, phoneLimit: AUTH_CONSTANTS.MAX_LOGIN_ATTEMPTS,
  ttl: AUTH_CONSTANTS.LOGIN_BLOCK_SECONDS * 1000,
};
const otp = {
  scope: 'otp', limit: 100, phoneLimit: AUTH_CONSTANTS.MAX_OTP_ATTEMPTS,
  ttl: AUTH_CONSTANTS.OTP_BLOCK_SECONDS * 1000,
};
const refresh = { scope: 'refresh', limit: 20, ttl: 60_000 };
const authPolicies = new Map<object, { scope: string; limit: number; ttl: number; phoneLimit?: number }>([
  [auth.register, credentials], [auth.login, credentials],
  [auth.verifyOtp, otp], [auth.resendOtp, otp],
  [auth.refreshToken, refresh],
]);
const authPolicy = (context: ExecutionContext) => authPolicies.get(context.getHandler());
const keyFor = (scope: string, ip: string) =>
  createHash('sha256').update(`v2:${scope}:${ip}`).digest('hex');
const phoneFor = (context: ExecutionContext): string | undefined => {
  const body: unknown = context.switchToHttp().getRequest<Request>().body;
  if (body && typeof body === 'object' && 'phone' in body && typeof body.phone === 'string' &&
      /^0(59|56)[0-9]{7}$/.test(body.phone)) return body.phone;
};

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
        generateKey: (context, ip) => {
          const policy = authPolicy(context)!;
          return keyFor(policy.phoneLimit ? `auth-ip:${policy.scope}` : policy.scope, ip);
        },
      },
      {
        name: 'auth-phone',
        ttl: context => authPolicy(context)!.ttl,
        limit: context => authPolicy(context)!.phoneLimit!,
        skipIf: context => benchmark || !authPolicy(context)?.phoneLimit || !phoneFor(context),
        generateKey: context => createHmac('sha256', config.getOrThrow<string>('JWT_SECRET'))
          .update(`auth-rate:v1:${authPolicy(context)!.scope}:${phoneFor(context)}`).digest('hex'),
      },
    ],
  };
}

const catalogReads = new Set<object>([
  ProductsController.prototype.findByStore, ProductsController.prototype.findOne,
  ProductsController.prototype.options, ProductsController.prototype.search,
  ProductsController.prototype.bestSellers, StoresController.prototype.findOne,
  StoresController.prototype.findAll, StoresController.prototype.findTopRated,
]);

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  private readonly fallbackLogger = new Logger(RateLimitGuard.name);
  private fallbackWindow = 0;
  private fallbackCount = 0;
  private nextFallbackLogAt = 0;

  protected override async handleRequest(props: ThrottlerRequest) {
    try {
      return await super.handleRequest(props);
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException) || !catalogReads.has(props.context.getHandler())) throw error;
      const window = Math.floor(Date.now() / 1000);
      if (window !== this.fallbackWindow) {
        this.fallbackWindow = window;
        this.fallbackCount = 0;
        if (Date.now() >= this.nextFallbackLogAt) {
          this.nextFallbackLogAt = Date.now() + 60_000;
          this.fallbackLogger.warn('Catalog rate limiter using bounded local fallback');
        }
      }
      if (++this.fallbackCount > 30) {
        await this.throwThrottlingException(props.context, {
          limit: 30, ttl: 1000, key: 'catalog-fallback', tracker: '', totalHits: this.fallbackCount,
          isBlocked: true, timeToExpire: 1, timeToBlockExpire: 1,
        });
      }
      return true;
    }
  }

  protected override async throwThrottlingException(context: ExecutionContext, detail: ThrottlerLimitDetail) {
    context.switchToHttp().getResponse<Response>().setHeader('Retry-After', detail.timeToBlockExpire);
    return super.throwThrottlingException(context, detail);
  }
}
