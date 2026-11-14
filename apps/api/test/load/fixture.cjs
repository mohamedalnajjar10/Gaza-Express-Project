const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { randomUUID } = require('node:crypto');
const { RedisStorage } = require('../dist/src/infrastructure/redis.module');
const { ConfigService } = require('@nestjs/config');
const { StoresService } = require('../dist/src/stores/stores.service');
const { ProductsService } = require('../dist/src/products/products.service');
const { CatalogCache } = require('../dist/src/infrastructure/catalog-cache');

const database = new URL(process.env.DATABASE_URL);
if (process.env.LOAD_TEST_MODE !== '1' || database.pathname !== '/wasla_load_test') throw new Error('Dedicated benchmark database required');
const db = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
let queries = 0;
db.$on('query', () => { queries++; });
const name = 'Benchmark shop 0';
const phone = (id) => `059${String(id).padStart(7, '0')}`;

async function seed() {
  const password = process.env.LOAD_PASSWORD;
  if (!password) throw new Error('LOAD_PASSWORD required');
  const password_hash = await bcrypt.hash(password, 12);
  await db.user.createMany({ data: Array.from({ length: 128 }, (_, i) => ({ phone: phone(i+1), password_hash, full_name: 'Benchmark customer', is_verified: true })), skipDuplicates: true });
  await db.user.updateMany({ where: { full_name: 'Benchmark customer' }, data: { password_hash } });
  const owner = await db.user.upsert({ where: { phone: phone(999) }, create: { phone: phone(999), password_hash, full_name: 'Benchmark store owner', role: 'store_owner', is_verified: true }, update: {} });
  const category = await db.storeCategory.upsert({ where: { nameAr: 'Benchmark fixture' }, create: { nameAr: 'Benchmark fixture' }, update: {} });
  if (!(await db.store.findFirst({ where: { storeName: name } }))) {
    await db.store.createMany({ data: Array.from({ length: 50 }, (_, i) => ({ storeName: `Benchmark shop ${i}`, ownerId: owner.user_id, categoryId: category.categoryId, areaId: 1, status: 'ACTIVE', latitude: 31.5, longitude: 34.45, avgRating: 4 })) });
    const stores = await db.store.findMany({ where: { categoryId: category.categoryId } });
    await db.productCategory.createMany({ data: stores.map(store => ({ storeId: store.storeId, nameAr: 'Benchmark catalog' })) });
    const categories = await db.productCategory.findMany();
    await db.product.createMany({ data: categories.flatMap(category => Array.from({ length: 30 }, (_, i) => ({ storeId: category.storeId, prodCategoryId: category.prodCategoryId, nameAr: `Benchmark item ${i}`, isPriceFixed: true, estimatedPriceMin: 10, estimatedPriceMax: 10, sortOrder: i }))) });
    const products = await db.product.findMany({ select: { productId: true } });
    await db.productOption.createMany({ data: products.map(product => ({ productId: product.productId, optionName: 'Benchmark option', extraCost: 2 })) });
  }
  const store = await db.store.findFirstOrThrow({ where: { storeName: name } });
  const product = await db.product.findFirstOrThrow({ where: { storeId: store.storeId }, orderBy: { productId: 'asc' } });
  console.log(JSON.stringify({ storeId: store.storeId, productId: product.productId, stores: await db.store.count(), products: await db.product.count() }));
}

async function profile() {
  const store = await db.store.findFirstOrThrow({ where: { storeName: name } });
  const uncached = new StoresService(db, new CatalogCache(new ConfigService({ CATALOG_CACHE_URL: '' })));
  const cache = new CatalogCache(new ConfigService());
  const cached = new StoresService(db, cache);
  const products = new ProductsService(db);
  const sample = async (label, fn) => { queries = 0; await fn(); console.log(JSON.stringify({ label, queries })); };
  try {
    await sample('catalog uncached', () => uncached.findAll({}));
    await sample('product page one row', () => products.findByStore(store.storeId, true, { page: 1, limit: 1 }));
    const oneRowQueries = queries;
    await sample('product page 25 rows', () => products.findByStore(store.storeId, true, { page: 1, limit: 25 }));
    if (queries !== oneRowQueries || queries > 3) throw new Error('Product list exceeded the SQL query budget');
    await sample('store preview', () => uncached.findOne(store.storeId));
    await cache.invalidate();
    await sample('catalog cache miss', () => cached.findAll({}));
    await sample('catalog cache hit', () => cached.findAll({}));
    if (queries !== 0) throw new Error('Expected a cache hit without SQL');
    try {
      await cached.toggleStatus(store.ownerId, store.storeId);
      const refreshed = await cached.findAll({});
      if (refreshed.data.find(row => row.storeId === store.storeId)?.isOpenNow !== !store.isOpenNow) throw new Error('Catalog invalidation failed');
      console.log(JSON.stringify({ label: 'catalog invalidation after write', passed: true }));
    } finally {
      await db.store.update({ where: { storeId: store.storeId }, data: { isOpenNow: store.isOpenNow } });
      await cache.invalidate();
    }
    const limiters = [new RedisStorage(new ConfigService()), new RedisStorage(new ConfigService())];
    try {
      const key = randomUUID();
      const counts = await Promise.all(limiters.map(limiter => limiter.increment(key, 2000, 2, 2000, 'profile')));
      const third = await limiters[0].increment(key, 2000, 2, 2000, 'profile');
      if (counts.map(result => result.totalHits).sort().join(',') !== '1,2' || !third.isBlocked) throw new Error('Shared throttling failed');
      console.log(JSON.stringify({ label: 'shared rate limiter', passed: true }));
    } finally { limiters.forEach(limiter => limiter.onModuleDestroy()); }
    const plans = [
      ['store ranking', await db.$queryRaw`EXPLAIN FORMAT=JSON SELECT store_id, avg_rating FROM stores WHERE status = 'ACTIVE' ORDER BY avg_rating DESC, store_id ASC LIMIT 20`],
      ['product list', await db.$queryRaw`EXPLAIN FORMAT=JSON SELECT product_id, sort_order FROM products WHERE store_id = ${store.storeId} AND is_available = TRUE ORDER BY sort_order, product_id LIMIT 25`],
    ];
    for (const [label, rows] of plans) {
      const query = JSON.parse(Object.values(rows[0])[0]).query_block;
      const operation = query.ordering_operation || query;
      console.log(JSON.stringify({ label, key: operation.table.key, rows: operation.table.rows_examined_per_scan, filesort: operation.using_filesort ?? false }));
    }
  } finally { cache.onModuleDestroy(); }
}

(process.argv[2] === 'profile' ? profile() : seed()).catch(error => { console.error(error.code || error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
