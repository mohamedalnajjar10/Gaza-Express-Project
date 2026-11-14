import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { UserRole } from '@prisma/client';
import { randomInt, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { AppModule } from '../src/app.module';
import { GoogleStrategy } from '../src/auth/strategies/google.strategy';
import { GlobalExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { RedisStorage } from '../src/infrastructure/redis.module';
import { SmsService } from '../src/sms/sms.service';
import { ProductMediaService } from '../src/products/product-media.service';
import { trackEndpoints } from './track-endpoints';

describe('Frontend HTTP contracts', () => {
  let app: INestApplication;
  let db: PrismaService;
  let config: ConfigService;
  const tag = randomUUID().slice(0, 8);
  const password = 'FixturePassword7!';
  const phone = `059${randomInt(1000000, 9999999)}`;
  const users: number[] = [];
  const stores: number[] = [];
  const storeCategories: number[] = [];
  const categories: number[] = [];
  const handoffs = new Map<string, string>();
  const tokens = new Map<string, string>();
  const imageName = `${randomUUID()}.webp`;
  const imagePath = `/api/v1/products/images/${imageName}`;
  const imageBytes = Buffer.from('image stream fixture');
  const upload = jest.fn().mockResolvedValue(imagePath);
  const remove = jest.fn().mockResolvedValue(undefined);
  type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';
  const call = (method: Method, path: string, actor?: string) => {
    const http = request(app.getHttpServer())[method](`/api/v1${path}`);
    return actor ? http.auth(tokens.get(actor)!, { type: 'bearer' }) : http;
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(RedisStorage).useValue({
      ping: async () => undefined,
      increment: async () => ({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
      saveGoogleHandoff: async (key: string, userId: number) => { handoffs.set(key, String(userId)); },
      consumeGoogleHandoff: async (key: string) => { const value = handoffs.get(key); handoffs.delete(key); return value; },
    }).overrideProvider(ProductMediaService).useValue({
      upload, remove, open: () => Readable.from([imageBytes]),
    }).compile();
    app = module.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    trackEndpoints(app);
    await app.init();
    db = app.get(PrismaService);
    config = app.get(ConfigService);
    config.set('SMS_PROVIDER', 'fake');
    config.set('SMS_OUTBOX_KEY', 'a'.repeat(64));
    const jwt = app.get(JwtService);
    for (const [actor, role] of Object.entries({ admin: 'admin', owner: 'store_owner', customer: 'customer', stranger: 'customer' } satisfies Record<string, UserRole>)) {
      const user = await db.user.create({ data: { phone: `qa-${tag}-${users.length}`, full_name: actor, role, password_hash: '', is_verified: true } });
      users.push(user.user_id);
      tokens.set(actor, jwt.sign({ sub: user.user_id, role, phone: user.phone, isActive: true }));
    }
  }, 30000);

  afterAll(async () => {
    if (db) {
      await db.storeModerationEvent.deleteMany({ where: { storeId: { in: stores } } });
      await db.store.deleteMany({ where: { storeId: { in: stores } } });
      await db.storeCategory.deleteMany({ where: { categoryId: { in: storeCategories } } });
      await db.category.deleteMany({ where: { id: { in: categories } } });
      const otps = await db.otpCode.findMany({ where: { phone }, select: { otp_id: true } });
      await db.smsJob.deleteMany({ where: { otpId: { in: otps.map(otp => otp.otp_id) } } });
      await db.otpCode.deleteMany({ where: { phone } });
      await db.user.deleteMany({ where: { OR: [{ user_id: { in: users } }, { phone }, { email: `${tag}@example.invalid` }] } });
      await db.$disconnect();
    }
    await app?.close();
  });

  it('registers, resends, verifies, signs in, reads the profile and logs out', async () => {
    const signup = { phone, password, full_name: 'Endpoint fixture' };
    await call('post', '/auth/register').send({ ...signup, role: 'admin' }).expect(400);
    const registered = await call('post', '/auth/register').send(signup).expect(201);
    expect(registered.body).toMatchObject({ success: true, data: { otp_id: expect.any(Number) } });
    await call('post', '/auth/login').send({ phone, password }).expect(403);
    await call('post', '/auth/resend-otp').send({ phone }).expect(400);
    await db.otpCode.update({ where: { otp_id: registered.body.data.otp_id }, data: { created_at: new Date(0) } });
    const resent = await call('post', '/auth/resend-otp').send({ phone }).expect(200);
    const job = await db.smsJob.findUniqueOrThrow({ where: { otpId: resent.body.data.otp_id } });
    const code = app.get(SmsService).decrypt(job);
    const wrong = code === '000000' ? '000001' : '000000';
    await call('post', '/auth/verify-otp').send({ phone, code: wrong }).expect(400);
    await call('post', '/auth/verify-otp').send({ phone, code }).expect(200);
    await call('post', '/auth/verify-otp').send({ phone, code }).expect(400);
    await call('post', '/auth/login').send({ phone, password: 'wrong-password' }).expect(401);
    const login = await call('post', '/auth/login').send({ phone, password }).expect(200);
    const session = login.body.data.tokens;
    tokens.set('registered', session.access_token);
    const profile = await call('get', '/auth/profile', 'registered').expect(200);
    expect(profile.body.data).toMatchObject({ phone, is_verified: true });
    expect(profile.body.data).not.toHaveProperty('password_hash');
    await call('get', '/auth/profile').expect(401);
    await call('post', '/auth/logout', 'registered').send({ refresh_token: session.refresh_token }).expect(200);
    await call('post', '/auth/refresh').send({ refresh_token: session.refresh_token }).expect(401);
  });

  it('exercises Google initiation, callback and one-time exchange with a simulated provider', async () => {
    config.set('GOOGLE_AUTH_ENABLED', 'true');
    config.set('GOOGLE_CLIENT_ID', 'fixture-id');
    config.set('GOOGLE_CLIENT_SECRET', 'fixture-secret');
    config.set('GOOGLE_CALLBACK_URL', 'http://localhost:5050/api/v1/auth/google/callback');
    config.set('FRONTEND_URL', 'http://localhost:3000');
    const strategy = new GoogleStrategy(config) as unknown as {
      _oauth2: { getOAuthAccessToken: (code: string, params: unknown, callback: Function) => void };
      userProfile: (token: string, callback: Function) => void;
    };
    jest.spyOn(strategy._oauth2, 'getOAuthAccessToken').mockImplementation((_code, _params, callback) => callback(null, 'fixture-access', 'fixture-refresh', {}));
    jest.spyOn(strategy, 'userProfile').mockImplementation((_token, callback) => callback(null, { id: tag, displayName: 'Test Google', emails: [{ value: `${tag}@example.invalid`, verified: true }] }));
    try {
      const start = await call('get', '/auth/google').expect(302);
      const state = new URL(start.headers.location).searchParams.get('state');
      const stateCookie = start.get('set-cookie')![0].split(';')[0];
      await call('get', '/auth/google/callback?code=fixture&state=invalid').set('Cookie', stateCookie).expect(401);
      const callback = await call('get', `/auth/google/callback?code=fixture&state=${state}`).set('Cookie', stateCookie).expect(302);
      expect(callback.headers.location).toBe('http://localhost:3000/auth/success');
      const cookie = callback.get('set-cookie')!.find(value => value.startsWith('wasla_google_exchange='))!.split(';')[0];
      const exchange = (origin: string) => call('post', '/auth/google/exchange').set('Origin', origin).set('Cookie', cookie);
      await exchange('http://other.invalid').expect(401);
      const session = await exchange('http://localhost:3000').expect(200);
      expect(session.body.data.tokens).toMatchObject({ access_token: expect.any(String), refresh_token: expect.any(String) });
      await exchange('http://localhost:3000').expect(401);
    } finally { config.set('GOOGLE_AUTH_ENABLED', 'false'); jest.restoreAllMocks(); }
  });

  it('admin can create, browse, update and disable users', async () => {
    const payload = { phone: `qa-${tag}-managed`, password, full_name: 'Managed fixture' };
    await call('post', '/users', 'customer').send(payload).expect(403);
    await call('post', '/users', 'admin').send({ ...payload, phone: '1'.repeat(21) }).expect(400);
    const created = await call('post', '/users', 'admin').send(payload).expect(201);
    const id = created.body.data.user_id;
    users.push(id);
    await call('get', '/users?limit=1', 'admin').expect(200);
    await call('get', `/users/${id}`, 'admin').expect(200);
    await call('patch', `/users/${id}`, 'admin').send({ full_name: 'Updated fixture' }).expect(200);
    await call('delete', `/users/${id}`, 'admin').expect(200);
    expect((await db.user.findUniqueOrThrow({ where: { user_id: id } })).is_active).toBe(false);
  });

  it('admin manages categories and subcategories with validation and duplicate protection', async () => {
    await call('post', '/categories', 'admin').send({ name: 'x' }).expect(400);
    const payload = { name: `Category ${tag}` };
    const category = await call('post', '/categories', 'admin').send(payload).expect(201);
    const id = category.body.data.id;
    categories.push(id);
    await call('post', '/categories', 'admin').send(payload).expect(409);
    await call('get', '/categories', 'admin').expect(200);
    await call('get', `/categories/${id}`, 'admin').expect(200);
    await call('patch', `/categories/${id}`, 'admin').send({ description: 'New description' }).expect(200);
    const sub = await call('post', '/subcategories', 'admin').send({ name: 'Subcategory', categoryId: id }).expect(201);
    const subPath = `/subcategories/${sub.body.data.id}`;
    const list = await call('get', `/subcategories?categoryId=${id}`, 'admin').expect(200);
    expect(list.body.data.map(row => row.id)).toContain(sub.body.data.id);
    await call('get', subPath, 'admin').expect(200);
    await call('patch', subPath, 'admin').send({ name: 'Renamed subcategory' }).expect(200);
    await call('delete', subPath, 'admin').expect(200);
    await call('delete', `/categories/${id}`, 'admin').expect(200);
    await call('get', `/categories/${id}`, 'admin').expect(404);
  });

  it('covers store, product, favorite and review lifecycle over the frontend envelope', async () => {
    const category = await call('post', '/store-categories', 'admin').send({ nameAr: `Fixture ${tag}` }).expect(201);
    const categoryId = category.body.data.categoryId;
    storeCategories.push(categoryId);
    await call('get', '/store-categories', 'customer').expect(200);
    await call('get', `/store-categories/${categoryId}`, 'customer').expect(200);
    await call('get', '/store-categories/2147483647', 'customer').expect(404);
    const storeBody = { categoryId, areaId: 1, storeName: `Fixture ${tag}`, storeNameAr: `Fixture ${tag}`, latitude: 31.5, longitude: 34.45 };
    const created = await call('post', '/stores', 'owner').send(storeBody).expect(201);
    const storeId = created.body.data.storeId;
    stores.push(storeId);
    const ownerStores = await call('get', '/stores/my-stores', 'owner').expect(200);
    expect(ownerStores.body.data.map(row => row.storeId)).toContain(storeId);
    await call('patch', `/stores/${storeId}/moderation`, 'admin').send({ status: 'ACTIVE', expectedStatus: 'PENDING_APPROVAL', reason: 'Fixture approval' }).expect(200);
    await call('get', `/stores?categoryId=${categoryId}`, 'customer').expect(200);
    await call('get', '/stores/top-rated?limit=101', 'customer').expect(400);
    await call('get', '/stores/top-rated', 'customer').expect(200);
    await call('patch', `/stores/${storeId}/toggle-status`, 'owner').expect(200);
    const pc = await call('post', '/product-categories', 'owner').send({ storeId, nameAr: 'Fixture products' }).expect(201);
    const prodCategoryId = pc.body.data.prodCategoryId;
    await call('get', `/product-categories?storeId=${storeId}`, 'customer').expect(200);
    await call('get', `/product-categories/${prodCategoryId}`, 'customer').expect(200);
    await call('patch', `/product-categories/${prodCategoryId}`, 'owner').send({ nameAr: 'Updated products' }).expect(200);
    const form = (actor: string, minPrice = '10') => call('post', '/products', actor)
      .field('storeId', storeId).field('prodCategoryId', prodCategoryId)
      .field('nameAr', 'Fixture product').field('nameEn', 'Fixture product')
      .field('estimatedPriceMin', minPrice).field('estimatedPriceMax', '12')
      .field('isPriceFixed', 'false').field('isAvailable', 'true')
      .attach('image', imageBytes, 'fixture.png');
    await form('stranger').expect(403);
    await form('owner', '0.0000001').expect(400);
    expect(upload).not.toHaveBeenCalled();
    const product = await form('owner').expect(201);
    expect(product.body.data).toMatchObject({ imageUrl: imagePath, isAvailable: true, isPriceFixed: false });
    expect(upload).toHaveBeenCalledWith(imageBytes);
    await call('get', `/products/images/${imageName}`, 'customer').expect('Content-Type', 'image/webp')
      .expect('Cache-Control', /no-store/).expect(200, imageBytes);
    const productId = product.body.data.productId;
    for (const path of ['/stores', '/stores/top-rated', `/stores/${storeId}`, '/store-categories',
      `/product-categories?storeId=${storeId}`, `/reviews/store/${storeId}`,
      `/products/store/${storeId}`, `/products/${productId}`, `/products/${productId}/options`, `/products/images/${imageName}`]) {
      await call('get', path).expect(401);
    }
    await db.productOption.create({ data: { productId, optionName: 'Fixture option', extraCost: 1 } });
    await call('get', `/products/${productId}`, 'customer').expect(200);
    const options = await call('get', `/products/${productId}/options`, 'customer').expect(200);
    expect(options.body.data).toHaveLength(1);
    const search = await call('get', `/products/search/${storeId}?q=Fixture`, 'customer').expect(200);
    expect(search.body.data.map(row => row.productId)).toContain(productId);
    await call('get', `/products/search/${storeId}`, 'customer').expect(400);
    await call('patch', `/products/${productId}`, 'owner').send({ nameEn: 'Renamed fixture' }).expect(200);
    await call('patch', `/products/${productId}/toggle-availability`, 'owner').expect(200);
    const unavailable = await call('get', `/products/store/${storeId}`, 'customer').expect(200);
    expect(unavailable.body.data).toEqual([]);
    await call('patch', `/products/${productId}/toggle-availability`, 'owner').expect(200);
    for (const [kind, id] of [['stores', storeId], ['products', productId]] as const) {
      await call('post', `/favorites/${kind}/${id}`, 'customer').expect(201);
      await call('post', `/favorites/${kind}/${id}`, 'customer').expect(409);
      expect((await call('get', `/favorites/${kind}`, 'customer').expect(200)).body.data).toHaveLength(1);
      expect((await call('get', `/favorites/${kind}/check/${id}`, 'customer').expect(200)).body.data).toBe(true);
      expect((await call('get', `/favorites/${kind}/check/${id}`, 'stranger').expect(200)).body.data).toBe(false);
      await call('delete', `/favorites/${kind}/${id}`, 'customer').expect(200);
    }
    await call('post', '/reviews', 'customer').send({ storeId, rating: 6 }).expect(400);
    const review = await call('post', '/reviews', 'customer').send({ storeId, rating: 4, comment: 'Fixture review' }).expect(201);
    await call('get', `/reviews/store/${storeId}`, 'customer').expect(200);
    await call('delete', `/reviews/${review.body.data.reviewId}`, 'stranger').expect(403);
    await call('delete', `/reviews/${review.body.data.reviewId}`, 'customer').expect(200);
    await call('delete', `/products/${productId}`, 'owner').expect(200);
    await call('delete', `/product-categories/${prodCategoryId}`, 'owner').expect(200);
    const disposable = await call('post', '/stores', 'owner').send({ ...storeBody, storeName: 'Disposable fixture' }).expect(201);
    stores.push(disposable.body.data.storeId);
    await call('delete', `/stores/${disposable.body.data.storeId}`, 'owner').expect(200);
  });

  it('validates address ownership and exposes paginated lists and admin queue status', async () => {
    const payload = { label: 'Home', address: 'Fixture address', latitude: 31.5, longitude: 34.45 };
    await call('post', '/addresses', 'customer').send({ ...payload, latitude: 91 }).expect(400);
    await call('post', '/addresses', 'customer').send({ ...payload, latitude: 1e-9 }).expect(400);
    const created = await call('post', '/addresses', 'customer').send({ ...payload, latitude: 1e-8 }).expect(201);
    expect(Number(created.body.data.latitude)).toBe(1e-8);
    const path = `/addresses/${created.body.data.id}`;
    await call('put', path, 'customer').send({ ...payload, longitude: -1e-9 }).expect(400);
    await call('put', path, 'stranger').send(payload).expect(404);
    await call('put', path, 'customer').send({ ...payload, label: 'Work' }).expect(200);
    const addresses = await call('get', '/addresses?limit=1', 'customer').expect(200);
    expect(addresses.body.data[0].label).toBe('Work');
    const orders = await call('get', '/orders', 'customer').expect(200);
    expect(orders.body.data).toEqual({ orders: [], nextBefore: null });
    await call('get', '/notifications/sms-queue', 'customer').expect(403);
    await call('get', '/notifications/sms-queue', 'admin').expect(200);
    config.set('WHATSAPP_VERIFY_TOKEN', 'fixture-webhook-token');
    const handshake = (token: string) => call('get', '/webhooks/whatsapp').query({ 'hub.mode': 'subscribe', 'hub.verify_token': token, 'hub.challenge': '12345' });
    await handshake('wrong').expect(403);
    await handshake('fixture-webhook-token').expect(200, '12345');
  });
});
