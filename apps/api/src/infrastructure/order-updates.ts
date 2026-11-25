import { Global, HttpException, HttpStatus, Injectable, Logger, Module, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UserRole } from '@prisma/client';
import type { Response } from 'express';
import Redis from 'ioredis';
import { createHash, randomUUID } from 'node:crypto';
import { Subject } from 'rxjs';

type Change = { users: number[]; independent: boolean };

@Injectable()
export class OrderUpdates implements OnModuleDestroy {
  private readonly logger = new Logger(OrderUpdates.name);
  private readonly changes = new Subject<Change>();
  private readonly connections = new Map<number, number>();
  private readonly closeStreams = new Set<() => void>();
  private readonly origin = randomUUID();
  private readonly channel: string;
  private readonly publisher?: Redis;
  private readonly subscriber?: Redis;
  private subscribed = false;

  constructor(config: ConfigService) {
    const namespace = createHash('sha256').update(config.getOrThrow<string>('JWT_SECRET')).digest('hex').slice(0, 24);
    this.channel = `wasla:order-updates:${namespace}`;
    if (config.get('NODE_ENV') === 'test') return;
    this.publisher = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true, maxRetriesPerRequest: 0, enableOfflineQueue: false, commandTimeout: 1000, connectTimeout: 1000,
    });
    this.subscriber = this.publisher.duplicate();
    this.publisher.on('error', () => undefined);
    this.subscriber.on('error', () => undefined);
    this.subscriber.on('ready', () => {
      void this.subscriber!.subscribe(this.channel).then(() => {
        this.subscribed = true;
      }, () => this.disconnectStreams());
    });
    this.subscriber.on('close', () => this.disconnectStreams());
    this.subscriber.on('message', (_channel, raw) => {
      try {
        const message = JSON.parse(raw) as Change & { origin: string };
        if (message.origin !== this.origin && Array.isArray(message.users)) this.changes.next(message);
      } catch {
        // Invalid broker messages carry no application state.
      }
    });
    void this.publisher.connect().catch(() => undefined);
    void this.subscriber.connect().catch(() => undefined);
  }

  publish(recipients: (number | null | undefined)[], independent = false) {
    const event = { users: [...new Set(recipients.filter((id): id is number => id != null))], independent };
    this.changes.next(event);
    if (this.publisher) {
      void this.publisher
        .publish(this.channel, JSON.stringify({ ...event, origin: this.origin }))
        .catch((error: unknown) => {
          this.logger.warn({
            event: 'order_updates_publish_failed',
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }
  }

  open(res: Response, actor: { user_id: number; role: UserRole }, independent: boolean) {
    if (res.destroyed || res.writableEnded) return;
    if (this.subscriber && (!this.subscribed || this.publisher?.status !== 'ready')) {
      throw new ServiceUnavailableException('Live updates unavailable');
    }
    const id = actor.user_id;
    const connections = this.connections.get(id) ?? 0;
    if (connections >= 4 || this.closeStreams.size >= 512) throw new HttpException('Too many live connections', HttpStatus.TOO_MANY_REQUESTS);
    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'private, no-store, no-transform',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    this.connections.set(id, connections + 1);
    const close = () => res.end();
    this.closeStreams.add(close);
    const write = (frame: string) => {
      if (!res.writableEnded && !res.write(frame)) close();
    };
    const subscription = this.changes.subscribe(change => {
      if (actor.role === 'admin' || change.users.includes(id) || (independent && change.independent)) {
        write('data: changed\n\n');
      }
    });
    const heartbeat = setInterval(() => write(': heartbeat\n\n'), 15_000);
    const lease = setTimeout(close, 120_000);
    res.once('close', () => {
      clearInterval(heartbeat);
      clearTimeout(lease);
      subscription.unsubscribe();
      this.closeStreams.delete(close);
      const remaining = (this.connections.get(id) ?? 1) - 1;
      if (remaining) this.connections.set(id, remaining);
      else this.connections.delete(id);
    });
    write('data: ready\n\n');
  }

  private disconnectStreams() {
    this.subscribed = false;
    for (const close of this.closeStreams) close();
  }

  onModuleDestroy() {
    this.disconnectStreams();
    this.publisher?.disconnect();
    this.subscriber?.disconnect();
    this.changes.complete();
  }
}

@Global()
@Module({ providers: [OrderUpdates], exports: [OrderUpdates] })
export class OrderUpdatesModule {}
