import { PrismaService } from 'prisma/prisma.service';
import { RedisStorage } from './infrastructure/redis.module';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { HttpStatus } from '@nestjs/common';

describe('AppController', () => {
  let controller: AppController;
  const mysql = { $queryRaw: jest.fn() };
  const redis = { ping: jest.fn() };

  beforeEach(async () => {
    mysql.$queryRaw.mockReset().mockResolvedValue([{ ready: 1 }]);
    redis.ping.mockReset().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: PrismaService, useValue: mysql }, { provide: RedisStorage, useValue: redis }],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('healthCheck', () => {
    it('should return health status with all required fields', () => {
      const result = controller.healthCheck();

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('uptime');
      expect(result).toHaveProperty('environment');
    });

    it('should return status "ok"', () => {
      const result = controller.healthCheck();

      expect(result.status).toBe('ok');
    });

    it('should return valid ISO timestamp', () => {
      const result = controller.healthCheck();

      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe('string');
      expect(() => new Date(result.timestamp)).not.toThrow();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('should return process uptime as number', () => {
      const result = controller.healthCheck();

      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return environment from NODE_ENV or default to "development"', () => {
      const result = controller.healthCheck();

      expect(result.environment).toBeDefined();
      expect(typeof result.environment).toBe('string');
      expect(['development', 'production', 'test', 'staging']).toContain(
        result.environment,
      );
    });

    it('should return development environment when NODE_ENV is not set', () => {
      const originalEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;

      const result = controller.healthCheck();

      expect(result.environment).toBe('development');

      process.env.NODE_ENV = originalEnv;
    });

    it('should return current NODE_ENV when set', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const result = controller.healthCheck();

      expect(result.environment).toBe('production');

      process.env.NODE_ENV = originalEnv;
    });

    it('should have consistent response structure', () => {
      const result1 = controller.healthCheck();
      const result2 = controller.healthCheck();

      expect(Object.keys(result1).sort()).toEqual(Object.keys(result2).sort());
      expect(Object.keys(result1)).toEqual([
        'status',
        'timestamp',
        'uptime',
        'environment',
      ]);
    });

    it('should return different timestamps on multiple calls', (done) => {
      const result1 = controller.healthCheck();

      setTimeout(() => {
        const result2 = controller.healthCheck();
        expect(result1.timestamp).not.toBe(result2.timestamp);
        done();
      }, 10);
    });

    it('should return increasing uptime on multiple calls', (done) => {
      const result1 = controller.healthCheck();

      setTimeout(() => {
        const result2 = controller.healthCheck();
        expect(result2.uptime).toBeGreaterThanOrEqual(result1.uptime);
        done();
      }, 10);
    });
  });

  describe('readinessCheck', () => {
    it('confirms both MySQL and Redis', async () => {
      await expect(controller.readinessCheck()).resolves.toEqual({ status: 'ready' });
      expect(mysql.$queryRaw).toHaveBeenCalledTimes(1);
      expect(redis.ping).toHaveBeenCalledTimes(1);
    });

    it('rejects readiness when Redis is down', async () => {
      redis.ping.mockRejectedValueOnce(new Error('connection failed'));
      await expect(controller.readinessCheck()).rejects.toMatchObject({ status: 503 });
    });

    it('rejects readiness when MySQL is down', async () => {
      mysql.$queryRaw.mockRejectedValueOnce(new Error('connection failed'));
      await expect(controller.readinessCheck()).rejects.toMatchObject({ status: 503 });
    });

    it('coalesces concurrent dependency probes', async () => {
      await Promise.all([controller.readinessCheck(), controller.readinessCheck()]);
      expect(mysql.$queryRaw).toHaveBeenCalledTimes(1);
      expect(redis.ping).toHaveBeenCalledTimes(1);
    });
  });

  describe('HTTP Status Codes', () => {
    it('healthCheck should use 200 OK status code', () => {
      // This test verifies the @HttpCode decorator usage
      const metadata = Reflect.getMetadata(
        '__httpCode__',
        controller.healthCheck,
      );
      expect(metadata).toBe(HttpStatus.OK);
    });

    it('readinessCheck should use 200 OK status code', () => {
      const metadata = Reflect.getMetadata(
        '__httpCode__',
        controller.readinessCheck,
      );
      expect(metadata).toBe(HttpStatus.OK);
    });
  });

  describe('Public Decorator', () => {
    it('healthCheck should be marked as public', () => {
      const isPublic = Reflect.getMetadata('isPublic', controller.healthCheck);
      expect(isPublic).toBe(true);
    });

    it('readinessCheck should be marked as public', () => {
      const isPublic = Reflect.getMetadata(
        'isPublic',
        controller.readinessCheck,
      );
      expect(isPublic).toBe(true);
    });
  });

  describe('API Routes', () => {
    it('healthCheck should be accessible at /health', () => {
      const path = Reflect.getMetadata('path', controller.healthCheck);
      expect(path).toBe('health');
    });

    it('readinessCheck should be accessible at /ready', () => {
      const path = Reflect.getMetadata('path', controller.readinessCheck);
      expect(path).toBe('ready');
    });
  });

  describe('Response Validation', () => {
    it('healthCheck response should be JSON serializable', () => {
      const result = controller.healthCheck();
      const jsonString = JSON.stringify(result);
      const parsed = JSON.parse(jsonString);

      expect(parsed).toEqual(result);
    });

  });

  describe('Edge Cases', () => {
    it('should handle multiple concurrent health checks', () => {
      const results = Array.from({ length: 100 }, () =>
        controller.healthCheck(),
      );

      results.forEach((result) => {
        expect(result.status).toBe('ok');
        expect(result).toHaveProperty('timestamp');
        expect(result).toHaveProperty('uptime');
        expect(result).toHaveProperty('environment');
      });
    });


    it('healthCheck should work in different environments', () => {
      const environments = ['development', 'production', 'test', 'staging'];
      const originalEnv = process.env.NODE_ENV;

      environments.forEach((env) => {
        process.env.NODE_ENV = env;
        const result = controller.healthCheck();
        expect(result.environment).toBe(env);
      });

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Performance', () => {
    it('healthCheck should respond quickly', () => {
      const start = Date.now();
      controller.healthCheck();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Should complete in less than 100ms
    });

  });
});