import { trackEndpoints } from './track-endpoints';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { createHmac, randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { AppModule } from '../src/app.module';
import { RedisStorage } from '../src/infrastructure/redis.module';

const actors = {
  customer: 'customer', stranger: 'customer', owner: 'store_owner', driver: 'driver', otherDriver: 'driver', admin: 'admin',
  near: 'driver', far: 'driver', areaDriver: 'driver', companyDriver: 'driver', manager: 'store_owner', recoveryManager: 'store_owner',
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
  const cart = async () => {
    const current = await api('customer', 'get', '/cart').expect(200);
    return api('customer', 'put', '/cart').send({ version: current.body.version, items: [{ productId, quantity: 2, optionIds: [optionId] }] }).expect(200);
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

  it('requires a signed WhatsApp message and an independent statement reconciliation for bank transfers', async () => {
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
    await reconcile('admin', 25).expect(400);
    await reconcile('admin').expect(200);
    await reconcile('admin').expect(200);
    expect((await db.customerOrder.findUniqueOrThrow({ where: { id: order.body.id } })).dispatchOpenedAt).toBeInstanceOf(Date);
    expect(await db.paymentEntry.count({ where: { orderId: order.body.id, kind: 'COLLECTION' } })).toBe(1);
    await act('owner', accepted.body, 'ready').expect(200);
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
});
