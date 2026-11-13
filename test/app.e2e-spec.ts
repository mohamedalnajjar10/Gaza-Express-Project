import { trackEndpoints } from './track-endpoints';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OtpType } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { SmsWorker } from '../src/sms/sms.worker';
import { createHash, randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../prisma/prisma.service';
import { RedisStorage } from '../src/infrastructure/redis.module';
import { SmsService } from '../src/sms/sms.service';
import { OtpService } from '../src/otp/otp.service';

describe('Foundation integration: real MySQL, real JWT, fake external delivery and rate storage', () => {
  let app: INestApplication;
  let db: PrismaService;
  let owner: any, other: any, category: any, store: any, product: any, productCategory: any;
  let ownerToken: string, otherToken: string;
  let sms: SmsService;
  const ping = jest.fn().mockResolvedValue(undefined);
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisStorage).useValue({ ping, increment: async () => ({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }) })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    trackEndpoints(app);
    await app.init(); db = app.get(PrismaService);
    sms = app.get(SmsService);
    const config = app.get(ConfigService);
    config.set('SMS_PROVIDER', 'fake');
    config.set('SMS_OUTBOX_KEY', 'a'.repeat(64));
    const tag = randomUUID().slice(0, 8);
    owner = await db.user.create({ data: { phone: `test-${tag}-a`, full_name: 'Owner', password_hash: '', role: 'store_owner', is_verified: true } });
    other = await db.user.create({ data: { phone: `test-${tag}-b`, full_name: 'Other', password_hash: '', role: 'store_owner', is_verified: true } });
    category = await db.storeCategory.create({ data: { nameAr: tag } });
    store = await db.store.create({ data: { ownerId: owner.user_id, categoryId: category.categoryId, areaId: 1, storeName: 'Fixture', status: 'ACTIVE' } });
    productCategory = await db.productCategory.create({ data: { storeId: store.storeId, nameAr: 'Fixture' } });
    product = await db.product.create({ data: { storeId: store.storeId, nameAr: 'Fixture' } });
    const jwt = app.get(JwtService);
    const token = (u: any) => jwt.sign({ sub: u.user_id, role: u.role, phone: u.phone, isActive: true });
    ownerToken = token(owner); otherToken = token(other);
  }, 30000);
  afterAll(async () => {
    if (store) await db.store.delete({ where: { storeId: store.storeId } });
    if (category) await db.storeCategory.delete({ where: { categoryId: category.categoryId } });
    if (owner) {
      const codes = await db.otpCode.findMany({ where: { user_id: owner.user_id }, select: { otp_id: true } });
      await db.smsJob.deleteMany({ where: { otpId: { in: codes.map(code => code.otp_id) } } });
    }
    for (const u of [owner, other]) if (u) await db.user.delete({ where: { user_id: u.user_id } });
    if (db) await db.$disconnect();
    if (app) await app.close();
  });
  it('serves the current health endpoint', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(response.body.status).toBe('ok');
  });
  it('reports dependency failures separately from liveness', async () => {
    await request(app.getHttpServer()).get('/api/v1/ready').expect(200);
    ping.mockRejectedValueOnce(new Error('Redis unavailable'));
    await request(app.getHttpServer()).get('/api/v1/ready').expect(503);
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });
  it('keeps Google OAuth disabled until a provider is explicitly configured', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/google').expect(404);
  });
  it('denies anonymous and non-admin access to user records', async () => {
    await request(app.getHttpServer()).get('/api/v1/users').expect(401);
    await request(app.getHttpServer()).get('/api/v1/users').auth(otherToken, { type: 'bearer' }).expect(403);
  });
  it('prevents cross-owner store writes and deletion', async () => {
    await request(app.getHttpServer()).patch(`/api/v1/stores/${store.storeId}`).auth(otherToken, { type: 'bearer' }).send({ storeName: 'Hijacked' }).expect(403);
    await request(app.getHttpServer()).delete(`/api/v1/stores/${store.storeId}`).auth(otherToken, { type: 'bearer' }).expect(403);
    expect((await db.store.findUniqueOrThrow({ where: { storeId: store.storeId } })).storeName).toBe('Fixture');
  });
  it('prevents cross-owner product and category mutation', async () => {
    await request(app.getHttpServer()).patch(`/api/v1/products/${product.productId}`).auth(otherToken, { type: 'bearer' }).send({ nameAr: 'Changed' }).expect(403);
    await request(app.getHttpServer()).delete(`/api/v1/product-categories/${productCategory.prodCategoryId}`).auth(otherToken, { type: 'bearer' }).expect(403);
  });
  it('allows owner writes but rejects injected privileged fields', async () => {
    await request(app.getHttpServer()).patch(`/api/v1/stores/${store.storeId}`).auth(ownerToken, { type: 'bearer' }).send({ ownerId: other.user_id }).expect(400);
    await request(app.getHttpServer()).patch(`/api/v1/stores/${store.storeId}`).auth(ownerToken, { type: 'bearer' }).send({ storeName: 'Updated' }).expect(200);
  });
  it('serializes simultaneous OTP issuance and resend across independent service instances', async () => {
    const first = app.get(OtpService);
    const second = new OtpService(db, sms as any, { get: (_: string, fallback: any) => fallback } as any);
    const results = await Promise.allSettled([
      first.sendOtp(owner.phone, OtpType.PHONE_VERIFICATION, owner.user_id),
      second.resendOtp(owner.phone, OtpType.PHONE_VERIFICATION, owner.user_id),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.otpCode.count({ where: { phone: owner.phone, is_used: false } })).toBe(1);
    const code = await db.otpCode.findFirstOrThrow({ where: { phone: owner.phone, is_used: false } });
    const job = await db.smsJob.findUniqueOrThrow({ where: { otpId: code.otp_id } });
    expect(job.status).toBe('PENDING');
    expect(sms.decrypt(job)).toMatch(/^\d{6}$/);
  });
  it('retries explicit rate limiting and sends once under concurrent claims', async () => {
    const code = await db.otpCode.findFirstOrThrow({ where: { phone: owner.phone, is_used: false } });
    const send = jest.fn().mockResolvedValueOnce({ status: 'retry', code: 'rate_limited' }).mockResolvedValue({ status: 'accepted', providerId: 'fixture' });
    const first = new SmsWorker(db, sms, { send });
    const second = new SmsWorker(db, sms, { send });
    await first.runOnce();
    const retry = await db.smsJob.findUniqueOrThrow({ where: { otpId: code.otp_id } });
    expect(retry).toMatchObject({ status: 'PENDING', attempts: 1, errorCode: 'rate_limited' });
    expect(retry.availableAt.getTime()).toBeGreaterThan(Date.now());
    await db.smsJob.update({ where: { id: retry.id }, data: { availableAt: new Date(0) } });
    await Promise.all([first.runOnce(), second.runOnce()]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(await db.smsJob.findUniqueOrThrow({ where: { id: retry.id } })).toMatchObject({ status: 'ACCEPTED', attempts: 2, payload: null });
  });
  it('quarantines an uncertain provider result without retrying or keeping the code', async () => {
    const otp = await db.otpCode.create({ data: { user_id: owner.user_id, phone: owner.phone, code: 'fixture', type: OtpType.LOGIN, expires_at: new Date(Date.now() + 120000) } });
    const job = await db.$transaction(tx => sms.enqueueVerification(tx, otp.otp_id, '456789', otp.expires_at));
    const send = jest.fn().mockRejectedValue(new Error('timeout'));
    const worker = new SmsWorker(db, sms, { send });
    await worker.runOnce();
    await worker.runOnce();
    expect(send).toHaveBeenCalledTimes(1);
    expect(await db.smsJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: 'UNKNOWN', payload: null, errorCode: 'transport_uncertain' });
  });
  it('rolls back OTP issuance if enqueue fails', async () => {
    const enqueue = jest.spyOn(sms, 'enqueueVerification').mockRejectedValueOnce(new Error('queue write failed'));
    try {
      await expect(app.get(OtpService).sendOtp(other.phone, OtpType.PHONE_VERIFICATION, other.user_id)).rejects.toThrow('Failed to send verification code');
      expect(await db.otpCode.count({ where: { user_id: other.user_id } })).toBe(0);
    } finally { enqueue.mockRestore(); }
  });
  it('stops after the third provider rate limit and erases the encrypted code', async () => {
    const otp = await db.otpCode.create({ data: { user_id: owner.user_id, phone: owner.phone, code: 'fixture', type: OtpType.LOGIN, expires_at: new Date(Date.now() + 120000) } });
    const job = await db.$transaction(tx => sms.enqueueVerification(tx, otp.otp_id, '456789', otp.expires_at));
    const send = jest.fn().mockResolvedValue({ status: 'retry', code: 'rate_limited' });
    const worker = new SmsWorker(db, sms, { send });
    for (let attempt = 0; attempt < 3; attempt++) {
      await db.smsJob.update({ where: { id: job.id }, data: { availableAt: new Date(0) } });
      await worker.runOnce();
    }
    await worker.runOnce();
    expect(send).toHaveBeenCalledTimes(3);
    expect(await db.smsJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: 'FAILED', attempts: 3, payload: null });
  });
  it('only accepts one concurrent refresh and stores one replacement', async () => {
    const raw = randomUUID();
    await db.refreshToken.create({ data: {
      user_id: owner.user_id,
      token: createHash('sha256').update(raw).digest('hex'),
      expires_at: new Date(Date.now() + 60000),
    } });
    const refresh = () => request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refresh_token: raw });
    const responses = await Promise.all([refresh(), refresh()]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 401]);
    expect(await db.refreshToken.count({ where: { user_id: owner.user_id, revoked_at: null } })).toBe(1);
  });
});
