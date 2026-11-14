import { CatalogCache } from './catalog-cache';
import { Global, Injectable, Module, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisStorage implements OnModuleDestroy {
  private readonly client: Redis;
  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 1000, commandTimeout: 1000,
      enableOfflineQueue: false,
    });
    this.client.on('error', () => undefined);
  }
  private connecting?: Promise<void>;
  private async connect() {
    if (this.client.status === 'wait') this.connecting = this.client.connect().finally(() => { this.connecting = undefined; });
    await this.connecting;
  }

  async ping() {
    await this.connect();
    await this.client.ping();
  }

  async saveGoogleHandoff(digest: string, userId: number) {
    await this.connect();
    await this.client.set(`auth:google:handoff:${digest}`, String(userId), 'EX', 60);
  }

  async consumeGoogleHandoff(digest: string) {
    await this.connect();
    return this.client.getdel(`auth:google:handoff:${digest}`);
  }

  async increment(key: string, ttl: number, limit: number, blockDuration: number, name: string) {
    try {
      await this.connect();
      const result = await this.client.eval(`
        local blocked = redis.call('PTTL', KEYS[2])
        if blocked > 0 then return {0, blocked, 1, blocked} end
        local count = redis.call('INCR', KEYS[1])
        if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
        local remaining = redis.call('PTTL', KEYS[1])
        if count > tonumber(ARGV[2]) then
          redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
          redis.call('DEL', KEYS[1])
          return {count, remaining, 1, tonumber(ARGV[3])}
        end
        return {count, remaining, 0, 0}
      `, 2, `rate:{${name}:${key}}:hits`, `rate:{${name}:${key}}:block`, ttl, limit, blockDuration || ttl) as number[];
      return { totalHits: result[0], timeToExpire: Math.ceil(result[1] / 1000), isBlocked: result[2] === 1, timeToBlockExpire: Math.ceil(result[3] / 1000) };
    } catch {
      throw new ServiceUnavailableException('Rate limit storage unavailable');
    }
  }
  onModuleDestroy() { this.client.disconnect(); }
}
@Global()
@Module({ providers: [RedisStorage, CatalogCache], exports: [RedisStorage, CatalogCache] })
export class RedisModule {}
