import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from 'prisma/prisma.service';
import { RedisStorage } from './infrastructure/redis.module';
import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';

@ApiTags('Health')
@Controller()
@SkipThrottle({ default: true, auth: true })
export class AppController {
  constructor(private readonly db: PrismaService, private readonly redis: RedisStorage) {}

  private probing?: Promise<boolean>;
  private routingProbe?: Promise<boolean>;


  @Public()
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Health check endpoint' })
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    };
  }

  @Public()
  @Get('routing-ready')
  async routingReadiness() {
    this.routingProbe ??= this.db.$queryRaw`SELECT 1`
      .then(() => true, () => false)
      .finally(() => { this.routingProbe = undefined; });
    return this.requireReady(this.routingProbe);
  }

  @Public()
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Readiness check for load balancers' })
  async readinessCheck() {
    this.probing ??= Promise.allSettled([this.db.$queryRaw`SELECT 1`, this.redis.ping()])
      .then(results => results.every(result => result.status === 'fulfilled'))
      .finally(() => { this.probing = undefined; });
    return this.requireReady(this.probing);
  }

  private async requireReady(probe: Promise<boolean>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const ready = await Promise.race([
        probe,
        new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 1500); }),
      ]);
      if (!ready) throw new ServiceUnavailableException('Dependencies unavailable');
      return { status: 'ready' };
    } finally { clearTimeout(timer); }
  }
}
