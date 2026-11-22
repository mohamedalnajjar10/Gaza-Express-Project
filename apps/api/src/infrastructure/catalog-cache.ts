import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';

@Injectable()
export class CatalogCache implements OnModuleDestroy {
  private readonly client?: Redis;
  private readonly logger = new Logger(CatalogCache.name);
  private readonly counters = { hits: 0, misses: 0, fallbacks: 0, invalidationFailures: 0 };
  private reporter?: NodeJS.Timeout;
  private readonly pending = new Map<string, Promise<unknown>>();
  private static readonly generation = 'catalog:v1:generation';

  constructor(config: ConfigService) {
    const url = config.get<string>('CATALOG_CACHE_URL');
    if (!url || url === 'disabled') return;
    this.client = new Redis(url, { lazyConnect: true, connectTimeout: 300, commandTimeout: 150, maxRetriesPerRequest: 0, enableOfflineQueue: false });
    this.client.on('error', () => undefined);
    void this.client.connect().catch(() => undefined);
    this.reporter = setInterval(() => {
      if (Object.values(this.counters).some(Boolean)) this.logger.log({ event: 'catalog_cache', ...this.counters });
      Object.assign(this.counters, { hits: 0, misses: 0, fallbacks: 0, invalidationFailures: 0 });
    }, 60_000);
    this.reporter.unref();
  }

  async read<T>(key: string, load: () => Promise<T>): Promise<T> {
    const client = this.client;
    if (!client) return load();
    if (client.status !== 'ready') return this.fallback(load);
    let generation: string | null;
    try {
      generation = await client.get(CatalogCache.generation);
      if (!generation) {
        await client.set(CatalogCache.generation, randomUUID(), 'NX');
        generation = await client.get(CatalogCache.generation);
      }
      if (!generation) return this.fallback(load);
    } catch { return this.fallback(load); }
    const cacheKey = `catalog:v1:${generation}:${key}`;
    try {
      const value = await client.get(cacheKey);
      if (value !== null) {
        const result = JSON.parse(value) as T;
        this.counters.hits++;
        return result;
      }
    } catch { return this.fallback(load); }
    this.counters.misses++;
    const existing = this.pending.get(cacheKey);
    if (existing) return existing as Promise<T>;
    const pending = (async () => {
      const value = await load();
      const json = JSON.stringify(value);
      if (Buffer.byteLength(json) <= 128 * 1024) {
        await client.set(cacheKey, json, 'EX', 20 + Math.floor(Math.random() * 6)).catch(() => { this.counters.fallbacks++; });
      }
      return value;
    })();
    this.pending.set(cacheKey, pending);
    try { return await pending; }
    finally { this.pending.delete(cacheKey); }
  }

  private fallback<T>(load: () => Promise<T>) {
    this.counters.fallbacks++;
    return load();
  }

  async invalidate() {
    await this.client?.set(CatalogCache.generation, randomUUID()).catch(() => { this.counters.invalidationFailures++; });
  }

  onModuleDestroy() { clearInterval(this.reporter); this.client?.disconnect(); }
}
