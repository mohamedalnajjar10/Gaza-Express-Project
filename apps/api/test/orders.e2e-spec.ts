import * as bcrypt from 'bcrypt';
import { trackEndpoints } from './track-endpoints';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { createHmac, randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { AppModule } from '../src/app.module';
import { RedisStorage } from '../src/infrastructure/redis.module';

const actors = {
  suspect: 'customer', customer: 'customer', prepaidBuyer: 'customer', stranger: 'customer', owner: 'store_owner', driver: 'driver', otherDriver: 'driver', bizDriver: 'driver', admin: 'admin',
  near: 'driver', far: 'driver', areaDriver: 'driver', companyDriver: 'driver', manager: 'store_owner', recoveryManager: 'store_owner', bizManager: 'store_owner',
} satisfies Record<string, UserRole>;
type Actor = keyof typeof actors;

describe('Order lifecycle on MySQL', () => {
  let app: INestApplication;
  let db: PrismaService;
  let storeId: number, categoryId: number, productId: number, optionId: number;
  const users = new Map<Actor, { id: number; token: string }>();
  const user = (actor: Actor) => users.get(actor)!;
  const api = (actor: Actor, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) =>
    request(app.getHttpServer())[method](`/api/v1${path}`).auth(user(actor).token, { type: 'bearer' });
  const addressData = { label: 'Home', address: 'Test delivery address', latitude: 31.5, longitude: 34.45 };
  const address = (actor: Actor = 'customer', data = addressData) => api(actor, 'post', '/addresses').send(data).expect(201);
  const cart = async (actor: Actor = 'customer') => {
    const current = await api(actor, 'get', '/cart').expect(200);
    return api(actor, 'put', '/cart').send({ version: current.body.version, items: [{ productId, quantity: 2, optionIds: [optionId] }] }).expect(200);
  };
  const checkout = (addressId: number, cartVersion: number, key = randomUUID()) =>
    api('customer', 'post', '/orders').set('Idempotency-Key', key).send({ addressId, cartVersion });
  const act = (actor: Actor, order: { id: number; version: number }, action: string, fields = {}) =>
    api(actor, 'patch', `/orders/${order.id}/status`).send({ action, version: order.version, ...fields });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(RedisStorage)
      .useValue({ increment: async () => ({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }) }).compile();
    app = module.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    trackEndpoints(app);
    await app.init();
    db = app.get(PrismaService);
    const config = app.get(ConfigService);
    config.set('DELIVERY_CODE_SECRET', 'test-delivery-secret');
    config.set('WHATSAPP_APP_SECRET', 'test-wa-secret');
    config.set('WHATSAPP_VERIFY_TOKEN', 'test-wa-token');
    config.set('WHATSAPP_PHONE_NUMBER_ID', 'test-wa-id');
    config.set('BANK_TRANSFER_INSTRUCTIONS', 'Test bank instructions');
    config.set('PAYMENT_SANDBOX_SECRET', 'test-payment-secret');
    const jwt = app.get(JwtService);
    const tag = randomUUID().slice(0, 8);
    for (const [actor, role] of Object.entries(actors)) {
      const account = await db.user.create({ data: { phone: `o-${tag}-${users.size}`, full_name: actor, password_hash: '', role, is_verified: true } });
      users.set(actor as Actor, { id: account.user_id, token: jwt.sign({ sub: account.user_id, role, phone: account.phone, isActive: true }) });
    }
    const category = await db.storeCategory.create({ data: { nameAr: tag } });
    categoryId = category.categoryId;
    const store = await db.store.create({ data: { ownerId: user('owner').id, categoryId, areaId: 1, storeName: 'Test shop', status: 'ACTIVE', latitude: 31.5, longitude: 34.45, deliveryRangeKm: 5, minOrderAmount: 10 } });
    storeId = store.storeId;
    const product = await db.product.create({ data: { storeId, nameAr: 'Original', estimatedPriceMin: 10, estimatedPriceMax: 12, productOptions: { create: { optionName: 'Original option', extraCost: 2 } } }, include: { productOptions: true } });
    productId = product.productId;
    optionId = product.productOptions[0].optionId;
  }, 30000);

  afterAll(async () => {
    if (db) {
      const ids = [...users.values()].map(account => account.id);
      await db.paymentEntry.deleteMany({ where: { payment: { order: { customerId: { in: ids } } } } });
      await db.payment.deleteMany({ where: { order: { customerId: { in: ids } } } });
      await db.orderEvent.deleteMany({ where: { order: { customerId: { in: ids } } } });
      await db.customerOrder.deleteMany({ where: { customerId: { in: ids } } });
      await db.driverProfile.deleteMany({ where: { userId: { in: ids } } });
      await db.deliveryCompany.deleteMany({ where: { managerId: { in: ids } } });
      if (storeId) await db.storeModerationEvent.deleteMany({ where: { storeId } });
      if (storeId) await db.store.delete({ where: { storeId } });
      if (categoryId) await db.storeCategory.delete({ where: { categoryId } });
      await db.user.deleteMany({ where: { user_id: { in: ids } } });
      await db.$disconnect();
    }
    await app?.close();
  });

  it('enforces store moderation authorization, state transitions and audit logging', async () => {
    await db.store.update({ where: { storeId }, data: { status: 'PENDING_APPROVAL' } });
    try {
      const path = `/stores/${storeId}/moderation`;
      const body = { expectedStatus: 'PENDING_APPROVAL', status: 'ACTIVE', reason: 'Verified store' };
      await api('owner', 'patch', path).send(body).expect(403);
      await api('customer', 'get', `/stores/${storeId}`).expect(404);
      const queue = await api('admin', 'get', '/stores/moderation').expect(200);
      expect(queue.body.some(store => store.storeId === storeId)).toBe(true);
      const results = await Promise.all([api('admin', 'patch', path).send(body), api('admin', 'patch', path).send(body)]);
      expect(results.map(response => response.status).sort()).toEqual([200, 409]);
      expect(await db.storeModerationEvent.findMany({ where: { storeId } })).toEqual([
        expect.objectContaining({ actorId: user('admin').id, fromStatus: 'PENDING_APPROVAL', toStatus: 'ACTIVE', reason: 'Verified store' }),
      ]);
      await api('customer', 'get', `/stores/${storeId}`).expect(200);
    } finally { await db.store.update({ where: { storeId }, data: { status: 'ACTIVE' } }); }
  });

  it('bounds product pages and keeps tied sort positions stable', async () => {
    const extra = await db.product.create({ data: { storeId, nameAr: 'Second fixture', sortOrder: 0 } });
    try {
      const first = await api('customer', 'get', `/products/store/${storeId}?page=1&limit=1`).expect(200);
      const second = await api('customer', 'get', `/products/store/${storeId}?page=2&limit=1`).expect(200);
      expect(first.body.map(product => product.productId)).toEqual([productId]);
      expect(second.body.map(product => product.productId)).toEqual([extra.productId]);
      await api('customer', 'get', `/products/store/${storeId}?limit=101`).expect(400);
    } finally { await db.product.delete({ where: { productId: extra.productId } }); }
  });

  it('deduplicates checkout, preserves snapshots and delivers after the customer approves the latest quote', async () => {
    const savedAddress = await address();
    const savedCart = await cart();
    const key = randomUUID();
    const [first, retry] = await Promise.all([
      checkout(savedAddress.body.id, savedCart.body.version, key).expect(201),
      checkout(savedAddress.body.id, savedCart.body.version, key).expect(201),
    ]);
    expect(first.body.id).toBe(retry.body.id);
    const inbox = await api('owner', 'get', '/notifications').expect(200);
    const alerts = inbox.body.notifications.filter(notification => notification.orderId === first.body.id && notification.kind === 'order.checkout');
    expect(alerts).toHaveLength(1);
    await api('stranger', 'patch', `/notifications/${alerts[0].id}/read`).expect(404);
    await api('owner', 'patch', `/notifications/${alerts[0].id}/read`).expect(204);
    await api('owner', 'patch', `/notifications/${alerts[0].id}/read`).expect(204);
    expect(first.body).toMatchObject({ estimatedMin: '24', estimatedMax: '28', requiresQuote: true });
    expect(await db.customerOrder.count({ where: { customerId: user('customer').id } })).toBe(1);
    await checkout(savedAddress.body.id, savedCart.body.version).expect(409);
    await checkout(savedAddress.body.id + 1, savedCart.body.version, key).expect(409);
    await api('stranger', 'get', `/orders/${first.body.id}`).expect(404);
    await api('stranger', 'delete', `/addresses/${savedAddress.body.id}`).expect(404);
    await act('owner', first.body, 'accept').expect(409);
    await act('customer', first.body, 'quote', { total: 25 }).expect(403);
    const initialQuote = await act('owner', first.body, 'quote', { total: 25 }).expect(200);
    const quote = await act('owner', initialQuote.body, 'quote', { total: 26 }).expect(200);
    await act('customer', initialQuote.body, 'approve_quote').expect(409);
    const approvals = await Promise.all([act('customer', quote.body, 'approve_quote'), act('customer', quote.body, 'approve_quote')]);
    expect(approvals.map(response => response.status).sort()).toEqual([200, 409]);
    const accepted = approvals.find(response => response.status === 200)!.body;
    expect(accepted.finalTotal).toBe('26');
    const ready = await act('owner', accepted, 'ready').expect(200);
    await act('owner', ready.body, 'assign', { driverId: user('driver').id }).expect(403);
    await act('admin', ready.body, 'assign', { driverId: user('driver').id }).expect(409);
    await api('admin', 'patch', `/drivers/${user('driver').id}/approval`).send({ approved: true }).expect(200);
    await api('customer', 'get', '/drivers/me/availability').expect(403);
    const unavailable = await api('driver', 'get', '/drivers/me/availability').expect(200);
    expect(unavailable.body).toMatchObject({ approved: true, available: false });
    await api('driver', 'patch', '/drivers/me/availability').send({ available: true }).expect(200);
    const available = await api('driver', 'get', '/drivers/me/availability').expect(200);
    expect(available.body.available).toBe(true);
    const offer = await act('admin', ready.body, 'assign', { driverId: user('driver').id }).expect(200);
    const driverOffer = await api('driver', 'get', `/orders/${offer.body.id}`).expect(200);
    expect(driverOffer.body).toMatchObject({ offerOnly: true });
    expect(driverOffer.body).not.toHaveProperty('addressSnapshot');
    expect(driverOffer.body).not.toHaveProperty('itemSnapshots');
    await act('driver', offer.body, 'pick_up').expect(409);
    const assigned = await act('driver', offer.body, 'accept_assignment').expect(200);
    await act('otherDriver', assigned.body, 'pick_up').expect(404);
    const pickedUp = await act('driver', assigned.body, 'pick_up').expect(200);
    await act('customer', pickedUp.body, 'cancel', { reason: 'Too late' }).expect(409);
    const proof = await api('customer', 'get', `/orders/${first.body.id}/delivery-code`).expect(200);
    const wrongCode = proof.body.code === '000000' ? '111111' : '000000';
    await act('driver', pickedUp.body, 'deliver', { deliveryCode: wrongCode, collectedAmount: 26 }).expect(400);
    expect(await db.customerOrder.findUnique({ where: { id: first.body.id }, select: { deliveryCodeAttempts: true } }))
      .toEqual({ deliveryCodeAttempts: 1 });
    await act('driver', pickedUp.body, 'deliver', { deliveryCode: proof.body.code, collectedAmount: 25 }).expect(400);
    const outcomes = await Promise.all([0, 1].map(() => act('driver', pickedUp.body, 'deliver', { deliveryCode: proof.body.code, collectedAmount: 26 })));
    expect(outcomes.map(response => response.status).sort()).toEqual([200, 200]);
    const ledger = await api('admin', 'get', `/orders/${first.body.id}/payment`).expect(200);
    expect(ledger.body).toMatchObject({ status: 'PAID', amount: '26', collectedBy: user('driver').id });
    expect(ledger.body.entries.filter(entry => entry.kind === 'COLLECTION')).toHaveLength(1);
    const settle = () => api('admin', 'post', `/orders/${first.body.id}/settlements`).send({ kind: 'cash_handover', reference: randomReference });
    const randomReference = randomUUID();
    const handover = await settle().expect(200);
    expect((await settle().expect(200)).body.id).toBe(handover.body.id);
    await db.product.update({ where: { productId }, data: { nameAr: 'Changed', estimatedPriceMin: 5 } });
    await db.productOption.update({ where: { optionId }, data: { optionName: 'Changed option' } });
    await api('customer', 'delete', `/addresses/${savedAddress.body.id}`).expect(204);
    const detail = await api('customer', 'get', `/orders/${first.body.id}`).expect(200);
    expect(detail.body).toMatchObject({ status: 'DELIVERED', finalTotal: '26', addressSnapshot: { address: addressData.address } });
    const unsold = await db.product.create({ data: { storeId, nameAr: 'Unsold fixture' } });
    try {
      const bestSellers = await api('customer', 'get', `/products/store/${storeId}/best-sellers`).expect(200);
      expect(bestSellers.body.map(product => product.productId)).toEqual([productId]);
      expect(bestSellers.body[0]).not.toHaveProperty('soldQuantity');
      expect(bestSellers.body[0].estimatedPriceMin).toBe('5');
    } finally {
      await db.product.delete({ where: { productId: unsold.productId } });
    }
    expect(detail.body.itemSnapshots[0]).toMatchObject({ nameAr: 'Original', unitMin: '12.00', options: [{ name: 'Original option', extraCost: '2.00' }] });
    expect(detail.body.events.map(event => event.action)).toEqual(['checkout', 'quote', 'quote', 'approve_quote', 'ready', 'assign', 'accept_assignment', 'pick_up', 'deliver']);
  });

  it('rejects an out-of-range address, another customer address and a newly unavailable item without consuming the cart', async () => {
    const outside = await address('customer', { ...addressData, latitude: 32.5 });
    const foreign = await address('stranger');
    const inside = await address();
    const saved = await cart();
    await checkout(outside.body.id, saved.body.version).expect(400);
    await checkout(foreign.body.id, saved.body.version).expect(404);
    await db.product.update({ where: { productId }, data: { isAvailable: false } });
    try { await checkout(inside.body.id, saved.body.version).expect(409); }
    finally { await db.product.update({ where: { productId }, data: { isAvailable: true } }); }
    const untouched = await api('customer', 'get', '/cart').expect(200);
    expect(untouched.body.version).toBe(saved.body.version);
    expect(untouched.body.items).toHaveLength(1);
  });

  it('accepts fixed prices and rejects duplicate cart consumption with different request keys', async () => {
    const savedAddress = await address();
    const savedCart = await cart();
    await api('customer', 'post', '/orders').set('Idempotency-Key', randomUUID())
      .send({ addressId: savedAddress.body.id, cartVersion: savedCart.body.version, total: 1 }).expect(400);
    await db.product.update({ where: { productId }, data: { isPriceFixed: true, estimatedPriceMin: 11 } });
    try {
      const responses = await Promise.all([
        checkout(savedAddress.body.id, savedCart.body.version),
        checkout(savedAddress.body.id, savedCart.body.version),
      ]);
      expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
      const order = responses.find(response => response.status === 201)!.body;
      const accepted = await act('owner', order, 'accept').expect(200);
      expect(accepted.body).toMatchObject({ status: 'ACCEPTED', finalTotal: '26', requiresQuote: false });
    } finally {
      await db.product.update({ where: { productId }, data: { isPriceFixed: false } });
    }
  });

  it('requires a private receipt and statement reconciliation even after a signed WhatsApp message', async () => {
    const savedAddress = await address();
    const savedCart = await cart();
    const order = await api('customer', 'post', '/orders').set('Idempotency-Key', randomUUID())
      .send({ addressId: savedAddress.body.id, cartVersion: savedCart.body.version, paymentMethod: 'BANK_TRANSFER' }).expect(201);
    const quote = await act('owner', order.body, 'quote', { total: 26 }).expect(200);
    const accepted = await act('customer', quote.body, 'approve_quote').expect(200);
    const payment = await api('customer', 'get', `/orders/${order.body.id}/payment`).expect(200);
    expect((await db.customerOrder.findUniqueOrThrow({ where: { id: order.body.id } })).dispatchOpenedAt).toBeNull();
    const reference = randomUUID();
    const reconcile = (actor: Actor, amount = 26) => api(actor, 'post', `/orders/${order.body.id}/payment/bank-reconciliation`).send({ amount, currency: 'ILS', reference });
    await act('owner', accepted.body, 'ready').expect(409);
    await reconcile('admin').expect(409);
    const body = JSON.stringify({ entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'test-wa-id' }, messages: [{ type: 'text', id: randomUUID(), text: { body: payment.body.whatsappText } }] } }] }] });
    const signature = 'sha256=' + createHmac('sha256', 'test-wa-secret').update(body).digest('hex');
    const hook = (value: string) => request(app.getHttpServer()).post('/api/v1/webhooks/whatsapp').set('x-hub-signature-256', value).type('json').send(body);
    await hook('invalid').expect(403);
    await hook(signature).expect(200);
    await hook(signature).expect(200);
    expect((await api('customer', 'get', `/orders/${order.body.id}/payment`).expect(200)).body).toMatchObject({ status: 'DUE', whatsappReceived: true });
    await reconcile('customer').expect(403);
    await reconcile('admin').expect(409);
    const receiptPath = `/orders/${order.body.id}/payment/receipt`;
    expect(payment.body.recipientPhone).toBe('0592229436');
    const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: 'white' } }).png().toBuffer();
    await api('stranger', 'post', receiptPath).attach('image', png, 'receipt.png').expect(404);
    await api('customer', 'post', receiptPath).attach('image', Buffer.from('bad'), 'fake.png').expect(400);
    await api('customer', 'post', receiptPath).attach('image', png, 'receipt.png').expect(201);
    await api('owner', 'get', receiptPath).expect(200).expect('Content-Type', /image/);
    await api('stranger', 'get', receiptPath).expect(404);
    await api('owner','post', receiptPath + '/report').send({ reason: 'Reference not found' }).expect(201);
    await reconcile('admin').expect(409);
    await api('owner','post', receiptPath + '/review').send({decision:'suspend'}).expect(403);
    await api('admin','post', receiptPath + '/review').send({decision:'dismiss'}).expect(201);
    await reconcile('owner').expect(403);
    await reconcile('admin', 25).expect(400);
    await reconcile('admin').expect(200);
    await reconcile('admin').expect(200);
    expect((await db.customerOrder.findUniqueOrThrow({ where: { id: order.body.id } })).dispatchOpenedAt).toBeInstanceOf(Date);
    expect(await db.paymentEntry.count({ where: { orderId: order.body.id, kind: 'COLLECTION' } })).toBe(1);
    await act('owner', accepted.body, 'ready').expect(200);
  });

  it('freezes the store recipient, holds disputed transfers and lets only an admin suspend the reported customer', async () => {
    const phone = '0561234567';
    await api('owner', 'patch', `/stores/${storeId}`).send({ bankTransferPhone: phone }).expect(200);
    try {
      const shipping = await address('suspect');
      const basket = await cart('suspect');
      const order = await api('suspect','post','/orders').set('Idempotency-Key', randomUUID())
        .send({ addressId: shipping.body.id, cartVersion: basket.body.version, paymentMethod: 'BANK_TRANSFER' }).expect(201);
      const quote = await act('owner', order.body, 'quote', { total: 26 }).expect(200);
      await act('suspect', quote.body, 'approve_quote').expect(200);
      const path = `/orders/${order.body.id}/payment`;
      await api('owner', 'patch', `/stores/${storeId}`).send({ bankTransferPhone: null }).expect(200);
      expect((await api('owner','get',path)).body).toMatchObject({ recipientPhone: phone, storeCollected: true });
      const png = await sharp({create:{width:4,height:4,channels:3,background:'white'}}).png().toBuffer();
      await api('suspect','post',path+'/receipt').attach('image',png,'receipt.png').expect(201);
      await api('owner','post',path+'/receipt/report').send({reason:'Statement mismatch'}).expect(201);
      await api('suspect','get','/auth/profile').expect(200);
      await api('admin','post',path+'/receipt/review').send({decision:'suspend'}).expect(201);
      await api('suspect','get','/auth/profile').expect(401);
      await api('owner','post',path+'/bank-reconciliation').send({amount:26,currency:'ILS',reference:randomUUID()}).expect(409);
      expect((await api('admin','get',path)).body.status).toBe('DUE');
    } finally {
      await db.store.update({where:{storeId},data:{bankTransferPhone:null}});
    }
  });

  it('analyzes receipt tampering and duplicates, surfaces fraud reports to admins, and supports account suspension/restoration', async () => {
    const fraudTag = randomUUID().slice(0, 8);
    const fraudPass = 'TestPass123!';
    const fraudPhone = `059${String(Math.floor(1000000 + Math.random() * 8999999))}`;
    const fraudAccount = await db.user.create({
      data: {
        phone: fraudPhone,
        full_name: `fraud-${fraudTag}`,
        password_hash: await bcrypt.hash(fraudPass, 4),
        role: 'customer',
        is_verified: true,
      },
    });
    const jwt = app.get(JwtService);
    const fraudToken = jwt.sign({ sub: fraudAccount.user_id, role: 'customer', phone: fraudAccount.phone, isActive: true, sessionVersion: 0 });
    const fraudApi = (method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) =>
      request(app.getHttpServer())[method](`/api/v1${path}`).auth(fraudToken, { type: 'bearer' });

    try {
      const basePng = await sharp({
        create: { width: 320, height: 480, channels: 3, background: { r: 245, g: 248, b: 246 } },
      })
        .composite([{
          input: await sharp({ create: { width: 180, height: 80, channels: 3, background: { r: 18, g: 91, b: 65 } } }).png().toBuffer(),
          top: 40,
          left: 70,
        }])
        .png()
        .toBuffer();
      const tamperedPng = injectPngTextChunk(basePng, 'Software', 'Canva');

      const shipping = await fraudApi('post', '/addresses').send(addressData).expect(201);
      const cart1 = await fraudApi('get', '/cart').expect(200);
      const put1 = await fraudApi('put', '/cart').send({ version: cart1.body.version, items: [{ productId, quantity: 2, optionIds: [optionId] }] }).expect(200);
      const order1 = await fraudApi('post', '/orders').set('Idempotency-Key', randomUUID())
        .send({ addressId: shipping.body.id, cartVersion: put1.body.version, paymentMethod: 'BANK_TRANSFER' }).expect(201);
      const quote1 = await act('owner', order1.body, 'quote', { total: 26 }).expect(200);
      await fraudApi('patch', `/orders/${quote1.body.id}/status`).send({ action: 'approve_quote', version: quote1.body.version }).expect(200);

      const path1 = `/orders/${order1.body.id}/payment`;
      await fraudApi('post', path1 + '/receipt')
        .field('claimedAmount', '10')
        .attach('image', tamperedPng, 'tampered.png')
        .expect(400);

      const upload1 = await fraudApi('post', path1 + '/receipt')
        .field('transferReference', `BOP-TEST-${fraudTag}`)
        .field('senderPhone', '0599887766')
        .field('claimedAmount', '26')
        .attach('image', tamperedPng, 'tampered.png')
        .expect(201);
      expect(upload1.body).toMatchObject({
        submitted: true,
        verificationStatus: 'FLAGGED_SUSPICIOUS',
        riskLevel: 'HIGH',
      });
      expect(upload1.body).not.toHaveProperty('forensicReport');

      const cart2 = await fraudApi('get', '/cart').expect(200);
      const put2 = await fraudApi('put', '/cart').send({ version: cart2.body.version, items: [{ productId, quantity: 2, optionIds: [optionId] }] }).expect(200);
      const order2 = await fraudApi('post', '/orders').set('Idempotency-Key', randomUUID())
        .send({ addressId: shipping.body.id, cartVersion: put2.body.version, paymentMethod: 'BANK_TRANSFER' }).expect(201);
      const quote2 = await act('owner', order2.body, 'quote', { total: 26 }).expect(200);
      const accepted2 = await fraudApi('patch', `/orders/${quote2.body.id}/status`).send({ action: 'approve_quote', version: quote2.body.version }).expect(200);
      await fraudApi('patch', `/orders/${accepted2.body.id}/status`).send({ action: 'cancel', version: accepted2.body.version, reason: 'Testing post-cancel fraud' }).expect(200);

      const path2 = `/orders/${order2.body.id}/payment`;
      const upload2 = await fraudApi('post', path2 + '/receipt')
        .field('transferReference', `BOP-TEST-${fraudTag}`)
        .attach('image', tamperedPng, 'duplicate.png')
        .expect(201);
      expect(upload2.body).toMatchObject({
        submitted: true,
        verificationStatus: 'FLAGGED_SUSPICIOUS',
        riskLevel: 'HIGH',
      });
      expect(upload2.body).not.toHaveProperty('forensicReport');

      await api('owner', 'post', path2 + '/receipt/report').send({ reason: 'Duplicate forged receipt' }).expect(201);
      await api('owner', 'get', '/finance/receipt-reports').expect(403);
      const queue = await api('admin', 'get', '/finance/receipt-reports?status=reported').expect(200);
      expect(queue.body.items.some((item: { orderId: number }) => item.orderId === order2.body.id)).toBe(true);

      const suspicious = await api('admin', 'get', '/finance/receipt-reports?status=suspicious').expect(200);
      expect(suspicious.body.items.some((item: { orderId: number }) => item.orderId === order1.body.id)).toBe(true);

      await api('admin', 'post', path1 + '/receipt/review').send({ decision: 'suspend', note: 'Verified fake receipt' }).expect(201);
      await api('admin', 'post', path1 + '/bank-reconciliation')
        .send({ amount: 26, currency: 'ILS', reference: randomUUID() }).expect(409);
      await fraudApi('get', '/auth/profile').expect(401);
      await request(app.getHttpServer()).post('/api/v1/auth/login').send({ phone: fraudPhone, password: fraudPass }).expect(403);

      await api('admin', 'patch', `/users/${fraudAccount.user_id}`).send({ is_active: true }).expect(200);
      // Pre-suspension JWT stays invalid due to incremented sessionVersion, while fresh login succeeds.
      await fraudApi('get', '/auth/profile').expect(401);
      const relogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ phone: fraudPhone, password: fraudPass }).expect(200);
      await request(app.getHttpServer()).get('/api/v1/auth/profile').auth(relogin.body.tokens.access_token, { type: 'bearer' }).expect(200);
    } finally {
      await db.paymentEntry.deleteMany({ where: { payment: { order: { customerId: fraudAccount.user_id } } } });
      await db.payment.deleteMany({ where: { order: { customerId: fraudAccount.user_id } } });
      await db.orderEvent.deleteMany({ where: { order: { customerId: fraudAccount.user_id } } });
      await db.customerOrder.deleteMany({ where: { customerId: fraudAccount.user_id } });
      await db.user.delete({ where: { user_id: fraudAccount.user_id } });
    }
  });

  it('records late electronic sandbox confirmation as refund-required on a cancelled order', async () => {
    const savedAddress = await address();
    const savedCart = await cart();
    const order = await api('customer', 'post', '/orders').set('Idempotency-Key', randomUUID())
      .send({ addressId: savedAddress.body.id, cartVersion: savedCart.body.version, paymentMethod: 'ELECTRONIC' }).expect(201);
    const quote = await act('owner', order.body, 'quote', { total: 26 }).expect(200);
    const accepted = await act('customer', quote.body, 'approve_quote').expect(200);
    await act('customer', accepted.body, 'cancel', { reason: 'Cancelled before payment' }).expect(200);
    const body = JSON.stringify({ amount: 26, currency: 'ILS', reference: randomUUID() });
    const sign = (id: number) => 'sha256=' + createHmac('sha256', 'test-payment-secret').update(`${id}.`).update(body).digest('hex');
    const hook = (signature: string) => request(app.getHttpServer()).post(`/api/v1/webhooks/payment-sandbox/${order.body.id}`).set('x-sandbox-signature', signature).type('json').send(body);
    await hook(sign(order.body.id + 1)).expect(403);
    await hook(sign(order.body.id)).expect(200, { status: 'REFUND_REQUIRED' });
    await hook(sign(order.body.id)).expect(200, { status: 'REFUND_REQUIRED' });
    expect(await db.paymentEntry.count({ where: { orderId: order.body.id } })).toBe(1);
    const refund = { amount: 26, currency: 'ILS', reference: randomUUID() };
    const refundPath = `/orders/${order.body.id}/payment/refund`;
    await api('customer', 'post', refundPath).send(refund).expect(403);
    await api('admin', 'post', refundPath).send(refund).expect(200, { status: 'REFUNDED' });
    await api('admin', 'post', refundPath).send(refund).expect(200, { status: 'REFUNDED' });
    const ledger = await db.paymentEntry.findMany({ where: { orderId: order.body.id }, orderBy: { id: 'asc' } });
    expect(ledger).toHaveLength(2);
    expect(ledger[1]).toMatchObject({ kind: 'REFUND', debit: ledger[0].credit, credit: ledger[0].debit });
    expect((await db.customerOrder.findUniqueOrThrow({ where: { id: order.body.id } })).status).toBe('CANCELLED');
  });

  it('allows a driver to accept only one of two concurrent offers', async () => {
    const savedAddress = await address();
    const offers = [];
    for (let index = 0; index < 2; index++) {
      const savedCart = await cart();
      const order = await checkout(savedAddress.body.id, savedCart.body.version).expect(201);
      const quote = await act('owner', order.body, 'quote', { total: 26 }).expect(200);
      const accepted = await act('customer', quote.body, 'approve_quote').expect(200);
      const ready = await act('owner', accepted.body, 'ready').expect(200);
      const offer = await act('admin', ready.body, 'assign', { driverId: user('driver').id }).expect(200);
      offers.push(offer.body);
    }
    const results = await Promise.all(offers.map(offer => act('driver', offer, 'accept_assignment')));
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect(await db.customerOrder.count({ where: { activeDriverId: user('driver').id } })).toBe(1);
    const assigned = results.find(result => result.status === 200)!.body;
    const pickedUp = await act('driver', assigned, 'pick_up').expect(200);
    await act('driver', pickedUp.body, 'confirm_return', { reason: 'Customer unavailable' }).expect(403);
    const returned = await act('admin', pickedUp.body, 'confirm_return', { reason: 'Store confirmed physical return' }).expect(200);
    expect(returned.body).toMatchObject({ status: 'CANCELLED', activeDriverId: null, deliveryCodeExpiresAt: null });
    expect(await db.customerOrder.count({ where: { activeDriverId: user('driver').id } })).toBe(0);
    expect(await db.payment.findUnique({ where: { orderId: assigned.id } })).toMatchObject({ status: 'VOID' });
  });

  it.each([
    { actor: 'owner', action: 'reject', status: 'REJECTED' },
    { actor: 'customer', action: 'cancel', status: 'CANCELLED' },
  ] as const)('records $action as a terminal state', async ({ actor, action, status }) => {
    const savedAddress = await address();
    const savedCart = await cart();
    const order = await checkout(savedAddress.body.id, savedCart.body.version).expect(201);
    const terminal = await act(actor, order.body, action, { reason: 'Test reason' }).expect(200);
    expect(terminal.body.status).toBe(status);
    await act('owner', terminal.body, 'quote', { total: 26 }).expect(409);
    const detail = await api('customer', 'get', `/orders/${order.body.id}`).expect(200);
    expect(detail.body.events[1]).toMatchObject({ action, details: { reason: 'Test reason' }, toStatus: status });
  });
  it('reserves rewards once, applies the discount to payment, and releases points after cancellation', async () => {
    const customerId = user('customer').id;
    const earned = await db.customerOrder.count({ where: { customerId, status: 'DELIVERED' } });
    await db.customerOrder.createMany({ data: Array.from({ length: Math.max(0, 10 - earned) }, () => ({
      customerId, storeId, status: 'DELIVERED' as const, idempotencyKey: randomUUID(), requestHash: 'fixture', storeName: 'Test shop',
      addressSnapshot: {}, itemSnapshots: [], currency: 'ILS', requiresQuote: false, estimatedMin: 24, estimatedMax: 24, finalTotal: 24, minimumAmount: 10,
    })) });
    const balance = async () => (await api('customer', 'get', '/rewards').expect(200)).body.balance;
    const initial = await balance();
    const savedAddress = await address();
    const savedCart = await cart();
    const key = randomUUID();
    const redeem = () => api('customer', 'post', '/orders').set('Idempotency-Key', key)
      .send({ addressId: savedAddress.body.id, cartVersion: savedCart.body.version, redeemReward: true }).expect(201);
    const first = await redeem();
    expect((await redeem()).body.id).toBe(first.body.id);
    expect(await balance()).toBe(initial - 100);
    const quote = await act('owner', first.body, 'quote', { total: 26 }).expect(200);
    const accepted = await act('customer', quote.body, 'approve_quote').expect(200);
    expect(accepted.body).toMatchObject({ finalTotal: '24.7', rewardDiscount: '1.3' });
    expect((await db.payment.findUniqueOrThrow({ where: { orderId: first.body.id } })).amount.toString()).toBe('24.7');
    await act('customer', accepted.body, 'cancel', { reason: 'Changed mind' }).expect(200);
    expect(await balance()).toBe(initial);
  });

  it('prioritizes proximity and allows only one driver to claim the same order during preparation', async () => {
    // The driver closer to the store is farther from the customer and loses on the combined distance.
    for (const [driver, latitude] of [['near', 31.526], ['far', 31.48]] as const) {
      await api('admin', 'patch', `/drivers/${user(driver).id}/approval`).send({ approved: true }).expect(200);
      await api(driver, 'patch', '/drivers/me/availability').send({ available: true }).expect(200);
      await api(driver, 'put', '/drivers/me/location').send({ latitude, longitude: 34.45 }).expect(204);
    }
    const savedAddress = await address('customer', { ...addressData, latitude: 31.54 });
    const savedCart = await cart();
    const order = (await checkout(savedAddress.body.id, savedCart.body.version).expect(201)).body;
    const merchantView = (await api('owner', 'get', `/orders/${order.id}`).expect(200)).body;
    expect(merchantView).toMatchObject({ customer: { full_name: 'customer' }, itemSnapshots: [{ quantity: 2 }] });
    const quote = (await act('owner', order, 'quote', { total: 26 }).expect(200)).body;
    const accepted = (await act('customer', quote, 'approve_quote').expect(200)).body;
    const nearOffer = (await api('near', 'get', '/drivers/me/offers').expect(200)).body.find(offer => offer.id === order.id);
    const farOffer = (await api('far', 'get', `/orders/${order.id}`).expect(200)).body;
    expect(nearOffer).toMatchObject({ status: 'ACCEPTED', offerOnly: true, openOffer: { nearby: true, canClaim: true } });
    expect(farOffer).toMatchObject({ offerOnly: true, openOffer: { nearby: false, canClaim: false } });
    expect(farOffer.openOffer.pickupKm).toBeLessThan(nearOffer.openOffer.pickupKm);
    expect(nearOffer).not.toHaveProperty('addressSnapshot');
    expect(farOffer).not.toHaveProperty('customerId');
    await act('far', accepted, 'claim_delivery').expect(409);
    await act('customer', accepted, 'claim_delivery').expect(403);

    await db.customerOrder.update({ where: { id: order.id }, data: { dispatchOpenedAt: new Date(Date.now() - 46_000) } });
    const attempts = await Promise.all([act('near', accepted, 'claim_delivery'), act('far', accepted, 'claim_delivery')]);
    expect(attempts.map(response => response.status).sort()).toEqual([200, 409]);
    const assigned = attempts.find(response => response.status === 200)!.body;
    const winner = assigned.driverId === user('near').id ? 'near' : 'far';
    expect(assigned.status).toBe('ACCEPTED');
    await act(winner, assigned, 'pick_up').expect(409);
    const tracking = `/orders/${order.id}/driver-tracking`;
    await api('stranger', 'get', tracking).expect(403);
    await api('manager', 'get', tracking).expect(404);
    const driver = (await api('owner', 'get', tracking).expect(200)).body.driver;
    expect(driver).toMatchObject({ name: winner, location: { longitude: 34.45 } });
    await api(winner, 'delete', '/drivers/me/location').expect(204);
    expect((await api('owner', 'get', tracking).expect(200)).body.driver.location).toBeNull();
    const ready = (await act('owner', assigned, 'ready').expect(200)).body;
    expect(ready).toMatchObject({ status: 'ASSIGNED', driverId: assigned.driverId });
    await act('owner', ready, 'cancel', { reason: 'Test completed' }).expect(200);
    expect((await api('owner', 'get', tracking).expect(200)).body.driver).toBeNull();
  });

  it('requires a confirmed contract and lets the company manager dispatch only a company driver', async () => {
    const company = (await api('admin', 'post', '/delivery-companies').send({
      name: 'Dispatch test company', managerId: user('manager').id,
    }).expect(201)).body;
    expect((await api('admin', 'get', '/delivery-companies').expect(200)).body).toEqual(expect.arrayContaining([company]));
    await api('admin', 'patch', `/drivers/${user('companyDriver').id}/approval`).send({ approved: true }).expect(200);
    await api('admin', 'put', `/drivers/${user('companyDriver').id}/delivery-company`).send({ deliveryCompanyId: company.id }).expect(204);
    await api('companyDriver', 'patch', '/drivers/me/availability').send({ available: true }).expect(200);
    await api('companyDriver', 'put', '/drivers/me/location').send({ latitude: 31.5, longitude: 34.45 }).expect(204);
    await api('admin', 'patch', `/drivers/${user('far').id}/approval`).send({ approved: true }).expect(200);
    await api('far', 'patch', '/drivers/me/availability').send({ available: true }).expect(200);

    const savedAddress = await address();
    const savedCart = await cart();
    const order = (await checkout(savedAddress.body.id, savedCart.body.version).expect(201)).body;
    const contract = `/stores/${storeId}/delivery-contracts/${company.id}`;
    await api('owner', 'put', `${contract}/request`).expect(204);
    expect((await api('owner', 'get', `/stores/${storeId}/delivery-partners`).expect(200)).body)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: company.id, contract: 'PENDING' })]));
    const queue = async () => (await api('manager', 'get', '/delivery-companies/me/queue').expect(200)).body;
    expect((await queue()).requests).toEqual([{ storeId, name: 'Test shop' }]);
    await act('owner', order, 'quote', { total: 26, deliveryCompanyId: company.id }).expect(409);
    await api('owner', 'put', `${contract}/confirm`).expect(404);
    await api('manager', 'put', `${contract}/confirm`).expect(204);
    await api('admin', 'put', contract).expect(204);
    const quote = (await act('owner', order, 'quote', { total: 26, deliveryCompanyId: company.id }).expect(200)).body;
    const accepted = (await act('customer', quote, 'approve_quote').expect(200)).body;
    expect(await queue()).toMatchObject({ orders: [{ id: order.id, status: 'ACCEPTED' }], drivers: [{ userId: user('companyDriver').id }] });
    expect((await api('companyDriver', 'get', '/drivers/me/offers').expect(200)).body).toEqual([]);
    await act('near', accepted, 'claim_delivery').expect(409);
    await act('owner', accepted, 'company_assign', { driverId: user('companyDriver').id }).expect(404);
    await act('manager', accepted, 'company_assign', { driverId: user('far').id }).expect(409);
    const assigned = (await act('manager', accepted, 'company_assign', { driverId: user('companyDriver').id }).expect(200)).body;
    expect(assigned).toMatchObject({ status: 'ACCEPTED', driverId: user('companyDriver').id });
    await act('admin', assigned, 'reroute_delivery', { reason: 'Driver already assigned' }).expect(409);
    expect(assigned).not.toHaveProperty('addressSnapshot');
    expect((await api('owner', 'get', `/orders/${order.id}/driver-tracking`).expect(200)).body.driver)
      .toMatchObject({ name: 'companyDriver', location: { latitude: 31.5 } });
    expect((await queue()).orders).toEqual([]);
  });

  it('blocks a stale company quote and lets only an admin recover unassigned company deliveries', async () => {
    const manager = user('recoveryManager');
    const company = (await api('admin', 'post', '/delivery-companies').send({ name: 'Recovery team', managerId: manager.id }).expect(201)).body;
    await api('admin', 'put', `/stores/${storeId}/delivery-contracts/${company.id}`).expect(204);
    const savedAddress = await address();
    const makeQuote = async (paymentMethod: 'CASH' | 'BANK_TRANSFER') => {
      const savedCart = await cart();
      const order = (await api('customer', 'post', '/orders').set('Idempotency-Key', randomUUID()).send({
        cartVersion: savedCart.body.version, addressId: savedAddress.body.id, paymentMethod,
      }).expect(201)).body;
      return (await act('owner', order, 'quote', { total: 26, deliveryCompanyId: company.id }).expect(200)).body;
    };
    const accepted = (await act('customer', await makeQuote('CASH'), 'approve_quote').expect(200)).body;
    const ready = (await act('owner', accepted, 'ready').expect(200)).body;
    const prepaid = (await act('customer', await makeQuote('BANK_TRANSFER'), 'approve_quote').expect(200)).body;
    const stale = await makeQuote('CASH');

    await api('admin', 'delete', `/users/${manager.id}`).expect(200);
    expect((await api('customer', 'get', `/orders/${stale.id}`).expect(200)).body.deliveryCompanyAvailable).toBe(false);
    await act('customer', stale, 'approve_quote').expect(409);
    expect(await db.payment.findUnique({ where: { orderId: stale.id } })).toBeNull();
    const revised = (await act('owner', stale, 'quote', { total: 26, deliveryCompanyId: null }).expect(200)).body;
    await act('customer', revised, 'approve_quote').expect(200);

    const reason = 'Delivery company unavailable';
    await act('owner', ready, 'reroute_delivery', { reason }).expect(403);
    await act('admin', ready, 'reroute_delivery').expect(400);
    const rerouted = (await act('admin', ready, 'reroute_delivery', { reason }).expect(200)).body;
    expect(rerouted).toMatchObject({ status: 'READY', deliveryCompanyId: null, driverId: null });
    expect(await db.orderEvent.findUnique({ where: { orderId_version: { orderId: ready.id, version: rerouted.version } } }))
      .toMatchObject({ action: 'reroute_delivery', fromStatus: 'READY', toStatus: 'READY', details: { reason, previousDeliveryCompanyId: company.id } });
    await act('admin', ready, 'reroute_delivery', { reason }).expect(409);

    const unpaid = (await act('admin', prepaid, 'reroute_delivery', { reason }).expect(200)).body;
    expect(unpaid).toMatchObject({ status: 'ACCEPTED', deliveryCompanyId: null, dispatchOpenedAt: null });
    await act('owner', unpaid, 'ready').expect(409);
  });

  it('shows matching area offers and permits claiming with GPS unavailable', async () => {
    await api('admin', 'patch', `/drivers/${user('areaDriver').id}/approval`).send({ approved: true }).expect(200);
    await api('areaDriver', 'patch', '/drivers/me/availability').send({ available: true, dispatchAreaId: 2 }).expect(200);
    const savedAddress = await address();
    const savedCart = await cart();
    const order = (await checkout(savedAddress.body.id, savedCart.body.version).expect(201)).body;
    const quoted = (await act('owner', order, 'quote', { total: 26 }).expect(200)).body;
    const accepted = (await act('customer', quoted, 'approve_quote').expect(200)).body;
    const offers = () => api('areaDriver', 'get', '/drivers/me/offers').expect(200);
    expect((await offers()).body.some(offer => offer.id === order.id)).toBe(false);
    await api('areaDriver', 'patch', '/drivers/me/availability').send({ dispatchAreaId: 1 }).expect(200);
    expect((await api('areaDriver', 'get', '/drivers/me/availability').expect(200)).body).toMatchObject({ available: true, dispatchAreaId: 1 });
    await db.customerOrder.update({ where: { id: order.id }, data: { dispatchOpenedAt: new Date(Date.now() - 46_000) } });
    const offer = (await offers()).body.find(offer => offer.id === order.id);
    expect(offer).toMatchObject({ openOffer: { pickupKm: null, nearby: true, canClaim: true } });
    const assigned = (await act('areaDriver', accepted, 'claim_delivery').expect(200)).body;
    expect(assigned.driverId).toBe(user('areaDriver').id);
    expect((await api('owner', 'get', `/orders/${order.id}/driver-tracking`).expect(200)).body.driver.location).toBeNull();
  });

  it('streams an authenticated invalidation after the checkout commits', async () => {
    await request(app.getHttpServer()).get('/api/v1/orders/updates').expect(401);
    await app.listen(0, '127.0.0.1');
    const controller = new AbortController();
    const deadline = AbortSignal.timeout(8_000);
    try {
      const response = await fetch(`${await app.getUrl()}/api/v1/orders/updates`, {
        headers: { Authorization: `Bearer ${user('owner').token}` },
        signal: AbortSignal.any([controller.signal, deadline]),
      });
      expect(response.headers.get('content-type')).toMatch(/^text\/event-stream/);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      expect(decoder.decode((await reader.read()).value)).toContain('data: ready');
      const savedAddress = await address();
      const savedCart = await cart();
      const submitted = (await checkout(savedAddress.body.id, savedCart.body.version).expect(201)).body;
      expect(decoder.decode((await reader.read()).value)).toContain('data: changed');
      await api('owner', 'get', `/orders/${submitted.id}`).expect(200);
    } finally { controller.abort(); }
  });

  it('applies tiered commissions, store PRO discount, distance delivery fees, company fees, and financial summaries', async () => {
    const config = app.get(ConfigService);
    const company = (await api('admin', 'post', '/delivery-companies').send({
      name: 'Express Fleet Co', managerId: user('bizManager').id, feePerOrder: 1.5,
    }).expect(201)).body;
    expect(company.feePerOrder).toBe('1.5');
    const updatedCompany = (await api('admin', 'patch', `/delivery-companies/${company.id}`).send({ feePerOrder: 2.0 }).expect(200)).body;
    expect(updatedCompany.feePerOrder).toBe('2');
    await api('customer', 'patch', `/delivery-companies/${company.id}`).send({ feePerOrder: 5 }).expect(403);
    await api('admin', 'put', `/stores/${storeId}/delivery-contracts/${company.id}`).expect(204);

    // 1. Admin sets category commission (600 bps = 6%); non-admin rejected
    await api('owner', 'patch', `/store-categories/${categoryId}`).send({ defaultCommissionBps: 600 }).expect(403);
    const updatedCat = (await api('admin', 'patch', `/store-categories/${categoryId}`).send({ defaultCommissionBps: 600 }).expect(200)).body;
    expect(updatedCat.defaultCommissionBps).toBe(600);

    // 2. Owner sets store delivery pricing; mass-assignment of planTier/commissionBps on PATCH /stores/:id is blocked
    await api('owner', 'patch', `/stores/${storeId}`).send({ planTier: 'PRO' }).expect(400);
    await api('owner', 'patch', `/stores/${storeId}`).send({ commissionBps: 100 }).expect(400);
    await api('owner', 'patch', `/stores/${storeId}`).send({
      deliveryBaseFee: 4, deliveryPerKmFee: 1.5, freeDeliveryThreshold: 100,
    }).expect(200);

    // 3. Delivery quote endpoint (~2 km north of store at 31.518, 34.45)
    const distantAddress = (await address('customer', { ...addressData, latitude: 31.518, longitude: 34.45 })).body;
    const paidQuote = (await api('customer', 'get', `/orders/delivery-quote?storeId=${storeId}&addressId=${distantAddress.id}&itemsSubtotal=26`).expect(200)).body;
    expect(Number(paidQuote.deliveryDistanceKm)).toBeGreaterThan(1.5);
    expect(Number(paidQuote.deliveryFee)).toBeGreaterThan(4);
    expect(paidQuote.freeDeliveryApplied).toBe(false);
    expect(paidQuote.withinRange).toBe(true);

    const freeQuote = (await api('customer', 'get', `/orders/delivery-quote?storeId=${storeId}&addressId=${distantAddress.id}&itemsSubtotal=100`).expect(200)).body;
    expect(freeQuote.freeDeliveryApplied).toBe(true);
    expect(freeQuote.deliveryFee).toBe('0.00');

    // 4. Checkout below threshold -> snapshot deliveryFee, category 6% commission, company 2.00 fee, platform delivery cut
    config.set('DELIVERY_PLATFORM_CUT_BPS', '1000'); // 10% platform margin on delivery fee
    config.set('PRO_COMMISSION_DISCOUNT_BPS', '150');
    try {
      const basket1 = await cart();
      const order1 = (await api('customer', 'post', '/orders').set('Idempotency-Key', randomUUID()).send({
        addressId: distantAddress.id, cartVersion: basket1.body.version, paymentMethod: 'CASH',
      }).expect(201)).body;
      const expectedDeliveryFee = paidQuote.deliveryFee;
      expect(Number(order1.deliveryFee).toFixed(2)).toBe(expectedDeliveryFee);
      expect(order1.rewardPointsEarned).toBe(10);

      const quoted1 = (await act('owner', order1, 'quote', { total: 26, deliveryCompanyId: company.id }).expect(200)).body;
      const accepted1 = (await act('customer', quoted1, 'approve_quote').expect(200)).body;
      expect(Number(accepted1.finalTotal)).toBeCloseTo(26 + Number(expectedDeliveryFee), 2);

      const payment1 = (await api('admin', 'get', `/orders/${order1.id}/payment`).expect(200)).body;
      expect(payment1.commissionBpsApplied).toBe(600);
      expect(payment1.companyFeeApplied).toBe('2');
      const total1 = Number(payment1.storeShare) + Number(payment1.driverShare) + Number(payment1.platformShare);
      expect(total1).toBeCloseTo(Number(payment1.amount), 2);
      // Items commission on 26 = 1.56; company fee = 2.00; deliveryMargin = 10% of deliveryFee
      const deliveryMargin = Number((Number(expectedDeliveryFee) * 0.1).toFixed(2));
      expect(Number(payment1.platformShare)).toBeCloseTo(1.56 + 2.0 + deliveryMargin, 2);
      expect(Number(payment1.driverShare)).toBeCloseTo(Number(expectedDeliveryFee) - deliveryMargin, 2);
      expect(Number(payment1.storeShare)).toBeCloseTo(26 - 1.56 - 2.0, 2);

      // 5. Admin upgrades store to PRO (600 - 150 = 450 bps effective) and merchant summary + platform summary work
      await api('customer', 'patch', `/stores/${storeId}/monetization`).send({ planTier: 'PRO' }).expect(403);
      const proStore = (await api('admin', 'patch', `/stores/${storeId}/monetization`).send({ planTier: 'PRO', commissionBps: null }).expect(200)).body;
      expect(proStore.planTier).toBe('PRO');

      // Free delivery threshold met when store lowers threshold to 24
      await api('owner', 'patch', `/stores/${storeId}`).send({ freeDeliveryThreshold: 24 }).expect(200);
      const basket2 = await cart();
      const order2 = (await api('customer', 'post', '/orders').set('Idempotency-Key', randomUUID()).send({
        addressId: distantAddress.id, cartVersion: basket2.body.version, paymentMethod: 'CASH',
      }).expect(201)).body;
      expect(Number(order2.deliveryFee)).toBe(0);
      const quoted2 = (await act('owner', order2, 'quote', { total: 26, deliveryCompanyId: null }).expect(200)).body;
      const accepted2 = (await act('customer', quoted2, 'approve_quote').expect(200)).body;
      const payment2 = (await api('admin', 'get', `/orders/${order2.id}/payment`).expect(200)).body;
      expect(payment2.commissionBpsApplied).toBe(450); // 600 - 150 PRO discount
      expect(Number(payment2.platformShare)).toBeCloseTo(26 * 0.045, 2);
      expect(Number(payment2.storeShare)).toBeCloseTo(26 - Number(payment2.platformShare), 2);
      await act('customer', accepted2, 'cancel', { reason: 'Cleanup pro order' }).expect(200);
      await act('customer', accepted1, 'cancel', { reason: 'Cleanup paid delivery order' }).expect(200);

      // 6. Merchant & platform summaries enforce roles and return analytics
      await api('customer', 'get', '/finance/merchant-summary').expect(403);
      const merchantSummary = (await api('owner', 'get', '/finance/merchant-summary').expect(200)).body;
      expect(merchantSummary.stores.find((s: { storeId: number }) => s.storeId === storeId)).toMatchObject({
        planTier: 'PRO',
        effectiveCommissionBps: 450,
      });

      await api('owner', 'get', '/finance/platform-summary').expect(403);
      const platformSummary = (await api('admin', 'get', '/finance/platform-summary').expect(200)).body;
      expect(platformSummary.totals.proStores).toBeGreaterThanOrEqual(1);
      expect(platformSummary.categories.some((c: { categoryId: number; defaultCommissionBps: number | null }) => c.categoryId === categoryId && c.defaultCommissionBps === 600)).toBe(true);
    } finally {
      config.set('DELIVERY_PLATFORM_CUT_BPS', '0');
      config.set('PRO_COMMISSION_DISCOUNT_BPS', '0');
      await api('admin', 'patch', `/stores/${storeId}/monetization`).send({ planTier: 'FREE', commissionBps: null }).expect(200);
      await api('owner', 'patch', `/stores/${storeId}`).send({ deliveryBaseFee: null, deliveryPerKmFee: null, freeDeliveryThreshold: null }).expect(200);
      await api('admin', 'patch', `/store-categories/${categoryId}`).send({ defaultCommissionBps: null }).expect(200);
    }
  });

  it('awards 20 double loyalty points for delivered Bank of Palestine orders', async () => {
    const shipping = (await address('prepaidBuyer')).body;
    const basket = await cart('prepaidBuyer');
    const created = (await api('prepaidBuyer', 'post', '/orders').set('Idempotency-Key', randomUUID()).send({
      addressId: shipping.id, cartVersion: basket.body.version, paymentMethod: 'BANK_TRANSFER',
    }).expect(201)).body;
    expect(created.rewardPointsEarned).toBe(20);

    const quoted = (await act('owner', created, 'quote', { total: 26 }).expect(200)).body;
    const accepted = (await act('prepaidBuyer', quoted, 'approve_quote').expect(200)).body;

    // Distinct high-entropy PNG so receipt forensics treats it as clean unique proof
    const w = 480;
    const h = 360;
    const pixels = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 3;
        pixels[idx] = (x * 13 + y * 7) % 256;
        pixels[idx + 1] = (x * 3 + y * 19) % 256;
        pixels[idx + 2] = (x * 29 + y * 5) % 256;
      }
    }
    const cleanReceipt = await sharp(pixels, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
    await api('prepaidBuyer', 'post', `/orders/${created.id}/payment/receipt`)
      .field('transferReference', `BOP-${randomUUID().slice(0, 8)}`)
      .field('senderPhone', '0591234567')
      .field('claimedAmount', '26')
      .attach('image', cleanReceipt, { filename: 'clean-receipt.png', contentType: 'image/png' })
      .expect(201);

    await api('admin', 'post', `/orders/${created.id}/payment/bank-reconciliation`).send({
      amount: 26, currency: 'ILS', reference: `BANK-${randomUUID().slice(0, 8)}`,
    }).expect(200);

    const refreshed = (await api('owner', 'get', `/orders/${created.id}`).expect(200)).body;
    const ready = (await act('owner', refreshed, 'ready').expect(200)).body;
    await db.customerOrder.update({ where: { id: created.id }, data: { dispatchOpenedAt: new Date(Date.now() - 46_000) } });
    await api('admin', 'patch', `/drivers/${user('bizDriver').id}/approval`).send({ approved: true }).expect(200);
    await api('bizDriver', 'patch', '/drivers/me/availability').send({ available: true, dispatchAreaId: 1 }).expect(200);
    await api('bizDriver', 'put', '/drivers/me/location').send({ latitude: 31.5, longitude: 34.45 }).expect(204);
    const claimed = (await act('bizDriver', ready, 'claim_delivery').expect(200)).body;
    const inTransit = (await act('bizDriver', claimed, 'pick_up').expect(200)).body;
    const code = (await api('prepaidBuyer', 'get', `/orders/${created.id}/delivery-code`).expect(200)).body.code;
    await act('bizDriver', inTransit, 'deliver', { deliveryCode: code }).expect(200);

    const rewardsRes = (await api('prepaidBuyer', 'get', '/rewards').expect(200)).body;
    expect(rewardsRes).toMatchObject({ balance: 20, pointsPerOrder: 10, bankTransferPointsPerOrder: 20 });

    const ownerSummary = (await api('owner', 'get', '/finance/merchant-summary').expect(200)).body;
    expect(ownerSummary.totals.deliveredOrders).toBeGreaterThanOrEqual(1);
    expect(Number(ownerSummary.totals.grossSales)).toBeGreaterThan(0);

    const adminSummary = (await api('admin', 'get', '/finance/platform-summary').expect(200)).body;
    expect(adminSummary.totals.deliveredOrders).toBeGreaterThanOrEqual(1);
    expect(Number(adminSummary.totals.grossMerchandiseValue)).toBeGreaterThan(0);
  });

  it('recalculates deliveryFee on QUOTE and APPROVE_QUOTE when total crosses freeDeliveryThreshold and rejects ?before=0', async () => {
    await api('customer', 'get', '/orders?before=0').expect(400);
    await api('customer', 'get', '/notifications?before=0').expect(400);
    await api('owner', 'patch', `/stores/${storeId}`).send({
      deliveryBaseFee: 4, deliveryPerKmFee: 1.5, freeDeliveryThreshold: 50,
    }).expect(200);
    try {
      const distantAddress = (await address('customer', { ...addressData, latitude: 31.518, longitude: 34.45 })).body;
      const basket = await cart();
      const order = (await checkout(distantAddress.id, basket.body.version).expect(201)).body;
      expect(Number(order.deliveryFee)).toBeGreaterThan(4);

      const quotedFree = (await act('owner', order, 'quote', { total: 60 }).expect(200)).body;
      expect(Number(quotedFree.deliveryFee)).toBe(0);

      const quotedPaid = (await act('owner', quotedFree, 'quote', { total: 30 }).expect(200)).body;
      expect(Number(quotedPaid.deliveryFee)).toBeGreaterThan(4);

      const quotedThreshold = (await act('owner', quotedPaid, 'quote', { total: 55 }).expect(200)).body;
      expect(Number(quotedThreshold.deliveryFee)).toBe(0);

      const accepted = (await act('customer', quotedThreshold, 'approve_quote').expect(200)).body;
      expect(Number(accepted.deliveryFee)).toBe(0);
      expect(accepted.finalTotal).toBe('55');
      const payment = (await api('admin', 'get', `/orders/${order.id}/payment`).expect(200)).body;
      expect(Number(payment.deliveryFee)).toBe(0);
      expect(payment.amount).toBe('55');
      await act('customer', accepted, 'cancel', { reason: 'Cleanup threshold test' }).expect(200);
    } finally {
      await api('owner', 'patch', `/stores/${storeId}`).send({
        deliveryBaseFee: null, deliveryPerKmFee: null, freeDeliveryThreshold: null,
      }).expect(200);
    }
  });

  it('allows admin fraud reporting on platform receipts and rejects bank reconciliation on FLAGGED_SUSPICIOUS receipts until dismissed', async () => {
    const buildReceiptPng = async (seed: number) => {
      const w = 480;
      const h = 360;
      const pixels = Buffer.alloc(w * h * 3);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 3;
          const band = seed % 2 === 0 ? Math.floor(x / 48) + Math.floor(y / 45) : Math.floor(x / 30) * 3 - Math.floor(y / 60);
          const bright = (band + seed) % 2 === 0 ? 235 : 35;
          pixels[idx] = (bright + ((x * seed) % 40)) % 256;
          pixels[idx + 1] = (bright + ((y * (seed + 3)) % 40)) % 256;
          pixels[idx + 2] = (bright + (((x + y) * seed) % 40)) % 256;
        }
      }
      return sharp(pixels, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
    };

    const shipping = (await address('prepaidBuyer')).body;
    const createBankOrder = async () => {
      const basket = await cart('prepaidBuyer');
      const created = (await api('prepaidBuyer', 'post', '/orders').set('Idempotency-Key', randomUUID()).send({
        addressId: shipping.id, cartVersion: basket.body.version, paymentMethod: 'BANK_TRANSFER',
      }).expect(201)).body;
      const quoted = (await act('owner', created, 'quote', { total: 26 }).expect(200)).body;
      return (await api('prepaidBuyer', 'patch', `/orders/${quoted.id}/status`).send({
        action: 'approve_quote', version: quoted.version,
      }).expect(200)).body;
    };

    // 1. Platform receipt: admin reports fraud -> blocks reconciliation until admin dismisses
    const platformOrder = await createBankOrder();
    const cleanPng = await buildReceiptPng(11);
    await api('prepaidBuyer', 'post', `/orders/${platformOrder.id}/payment/receipt`)
      .field('transferReference', `BOP-ADMIN-${randomUUID().slice(0, 8)}`)
      .attach('image', cleanPng, { filename: 'platform-receipt.png', contentType: 'image/png' })
      .expect(201);
    await api('admin', 'post', `/orders/${platformOrder.id}/payment/receipt/report`)
      .send({ reason: 'Missing from platform bank statement' })
      .expect(201);
    await api('admin', 'post', `/orders/${platformOrder.id}/payment/bank-reconciliation`)
      .send({ amount: 26, currency: 'ILS', reference: `RECON-${randomUUID().slice(0, 8)}` })
      .expect(409);
    await api('admin', 'post', `/orders/${platformOrder.id}/payment/receipt/review`)
      .send({ decision: 'dismiss', note: 'Verified late statement entry' })
      .expect(201);
    await api('admin', 'post', `/orders/${platformOrder.id}/payment/bank-reconciliation`)
      .send({ amount: 26, currency: 'ILS', reference: `RECON-${randomUUID().slice(0, 8)}` })
      .expect(200, { status: 'PAID' });

    // 2. Auto-flagged suspicious receipt: reconciliation blocked (409) until admin dismisses without prior report
    const suspiciousOrder = await createBankOrder();
    const suspiciousPng = injectPngTextChunk(await buildReceiptPng(29), 'Software', 'Canva');
    const upload = await api('prepaidBuyer', 'post', `/orders/${suspiciousOrder.id}/payment/receipt`)
      .field('transferReference', `BOP-SUSP-${randomUUID().slice(0, 8)}`)
      .attach('image', suspiciousPng, { filename: 'suspicious-receipt.png', contentType: 'image/png' })
      .expect(201);
    expect(upload.body.verificationStatus).toBe('FLAGGED_SUSPICIOUS');

    await api('admin', 'post', `/orders/${suspiciousOrder.id}/payment/bank-reconciliation`)
      .send({ amount: 26, currency: 'ILS', reference: `RECON-${randomUUID().slice(0, 8)}` })
      .expect(409);
    await api('admin', 'post', `/orders/${suspiciousOrder.id}/payment/receipt/review`)
      .send({ decision: 'dismiss', note: 'Verified genuine bank transfer' })
      .expect(201);
    await api('admin', 'post', `/orders/${suspiciousOrder.id}/payment/bank-reconciliation`)
      .send({ amount: 26, currency: 'ILS', reference: `RECON-${randomUUID().slice(0, 8)}` })
      .expect(200, { status: 'PAID' });
  });
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function injectPngTextChunk(png: Buffer, keyword: string, value: string): Buffer {
  const payload = Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(value, 'latin1')]);
  const typeAndData = Buffer.concat([Buffer.from('tEXt', 'ascii'), payload]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(payload.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  const chunk = Buffer.concat([len, typeAndData, crc]);
  return Buffer.concat([png.subarray(0, png.length - 12), chunk, png.subarray(png.length - 12)]);
}
