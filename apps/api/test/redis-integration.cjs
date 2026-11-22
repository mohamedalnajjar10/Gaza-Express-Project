const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { ConfigService } = require('@nestjs/config');
const { RedisStorage } = require('../dist/src/infrastructure/redis.module');

async function main() {
  const config = new ConfigService({ REDIS_URL: process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6379' });
  const first = new RedisStorage(config);
  const second = new RedisStorage(config);
  try {
    await Promise.all([first.ping(), second.ping()]);
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      (index % 2 ? first : second).increment(key, 2000, 5, 2000, 'test')));
    assert.equal(results.filter(x => !x.isBlocked).length, 5);
    assert.equal(results.filter(x => x.isBlocked).length, 7);
  } finally {
    first.onModuleDestroy();
    second.onModuleDestroy();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
