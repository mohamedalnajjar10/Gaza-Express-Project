import { PageDto, pageWindow } from 'src/common/dto/page.dto';
import { recordNotifications } from '../notifications/record-notifications';
import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma, UserRole } from '@prisma/client';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { FinanceService } from '../finance/finance.service';
import { PrismaService } from 'prisma/prisma.service';
import { AddressDto, CartItemDto, CheckoutDto, OrderAction, OrderActionDto, ReplaceCartDto } from './orders.dto';

type Actor = { user_id: number; role: UserRole };
const emptyCart = { version: 0, storeId: null, items: [] };

@Injectable()
export class OrdersService {
  constructor(private readonly db: PrismaService, private readonly finance: FinanceService) {}

  private customer(actor: Actor) {
    if (actor.role !== 'customer') throw new ForbiddenException('Customer account required');
    return actor.user_id;
  }

  addresses(actor: Actor, page = new PageDto()) {
    return this.db.deliveryAddress.findMany({ where: { customerId: this.customer(actor) }, orderBy: { id: 'desc' }, ...pageWindow(page) });
  }

  createAddress(actor: Actor, dto: AddressDto) {
    return this.db.deliveryAddress.create({ data: { ...dto, customerId: this.customer(actor) } });
  }

  async updateAddress(actor: Actor, id: number, dto: AddressDto) {
    const where = { id, customerId: this.customer(actor) };
    const result = await this.db.deliveryAddress.updateMany({ where, data: dto });
    if (!result.count) throw new NotFoundException('Address not found');
    return this.db.deliveryAddress.findFirstOrThrow({ where });
  }

  async deleteAddress(actor: Actor, id: number) {
    const result = await this.db.deliveryAddress.deleteMany({ where: { id, customerId: this.customer(actor) } });
    if (!result.count) throw new NotFoundException('Address not found');
  }

  async cart(actor: Actor) {
    const cart = (await this.db.shoppingCart.findUnique({ where: { customerId: this.customer(actor) } })) ?? emptyCart;
    const items = cart.items as CartItemDto[];
    if (!items.length) return { ...cart, store: null, items, products: [], estimatedMin: '0', estimatedMax: '0' };
    const [store, products] = await Promise.all([
      cart.storeId ? this.db.store.findUnique({ where: { storeId: cart.storeId }, select: { storeName: true, storeNameAr: true } }) : null,
      this.db.product.findMany({
      where: { productId: { in: items.map(item => item.productId) } },
      select: {
        productId: true, nameAr: true, imageUrl: true, unitAr: true, isAvailable: true,
        estimatedPriceMin: true, estimatedPriceMax: true, isPriceFixed: true,
        productOptions: { select: { optionId: true, optionName: true, optionNameAr: true, extraCost: true, isAvailable: true } },
      },
      }),
    ]);
    const byId = new Map(products.map(product => [product.productId, product]));
    let min = new Prisma.Decimal(0);
    let max = new Prisma.Decimal(0);
    for (const item of items) {
      const product = byId.get(item.productId);
      const options = product?.productOptions.filter(option => option.isAvailable && item.optionIds.includes(option.optionId));
      if (!product?.isAvailable || options?.length !== item.optionIds.length) {
        return { ...cart, store, items, products };
      }
      const extra = options.reduce((sum, option) => sum.plus(option.extraCost), new Prisma.Decimal(0));
      min = min.plus(product.estimatedPriceMin.plus(extra).times(item.quantity));
      max = max.plus((product.isPriceFixed ? product.estimatedPriceMin : product.estimatedPriceMax).plus(extra).times(item.quantity));
    }
    return { ...cart, store, items, products, estimatedMin: min.toString(), estimatedMax: max.toString() };
  }

  async replaceCart(actor: Actor, dto: ReplaceCartDto) {
    const customerId = this.customer(actor);
    return this.db.$transaction(async tx => {
      await this.lockCustomer(tx, customerId);
      const current = await tx.shoppingCart.findUnique({ where: { customerId } });
      if ((current?.version ?? 0) !== dto.version) throw new ConflictException('Cart has changed');
      const catalog = dto.items.length ? await this.catalog(tx, dto.items) : null;
      const items = dto.items.map(({ productId, quantity, optionIds }) => ({ productId, quantity, optionIds }));
      const data = { storeId: catalog?.store.storeId ?? null, items, version: dto.version + 1 };
      const cart = await tx.shoppingCart.upsert({ where: { customerId }, create: { customerId, ...data }, update: data });
      return { ...cart, items, estimatedMin: catalog?.min.toString() ?? '0', estimatedMax: catalog?.max.toString() ?? '0' };
    });
  }

  private async rewardBalance(db: Prisma.TransactionClient, customerId: number) {
    const rows = await db.customerOrder.groupBy({
      by: ['status'],
      where: { customerId, status: { notIn: ['CANCELLED', 'REJECTED'] } },
      _count: { _all: true },
      _sum: { rewardPointsUsed: true },
    });
    const earned = (rows.find(row => row.status === 'DELIVERED')?._count._all ?? 0) * 10;
    return earned - rows.reduce((used, row) => used + (row._sum.rewardPointsUsed ?? 0), 0);
  }

  async rewards(actor: Actor) {
    return { balance: await this.rewardBalance(this.db, this.customer(actor)), pointsPerOrder: 10, pointsRequired: 100, discountPercent: 5 };
  }

  async checkout(actor: Actor, key: string | undefined, dto: CheckoutDto) {
    const customerId = this.customer(actor);
    if (!key || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) throw new BadRequestException('Invalid Idempotency-Key');
    const idempotencyKey = key.toLowerCase();
    const paymentMethod = dto.paymentMethod ?? 'CASH';
    const note = dto.note?.trim();
    const requestHash = createHash('sha256').update(`${dto.cartVersion}:${dto.addressId}${paymentMethod === 'CASH' ? '' : `:${paymentMethod}`}${dto.redeemReward ? ':reward' : ''}${note ? `:note:${note}` : ''}`).digest('hex');
    return this.db.$transaction(async tx => {
      await this.lockCustomer(tx, customerId);
      const existing = await tx.customerOrder.findUnique({ where: { customerId_idempotencyKey: { customerId, idempotencyKey } } });
      if (existing) {
        if (existing.requestHash !== requestHash) throw new ConflictException('Idempotency key already used for different checkout');
        return existing;
      }
      this.finance.assertEnabled(paymentMethod);
      const cart = await tx.shoppingCart.findUnique({ where: { customerId } });
      if (!cart || cart.version !== dto.cartVersion) throw new ConflictException('Cart has changed');
      const items = cart.items as unknown as CartItemDto[];
      if (!items.length) throw new BadRequestException('Cart is empty');
      const address = await tx.deliveryAddress.findFirst({ where: { id: dto.addressId, customerId } });
      if (!address) throw new NotFoundException('Address not found');
      const { store, snapshots, min, max, requiresQuote } = await this.catalog(tx, items);
      if (store.status !== 'ACTIVE' || !store.isOpenNow) throw new ConflictException('Store is not accepting orders');
      if (store.latitude === null || store.longitude === null) throw new ConflictException('Store delivery location is missing');
      if (distanceKm(+store.latitude, +store.longitude, +address.latitude, +address.longitude) > +store.deliveryRangeKm) {
        throw new BadRequestException('Address is outside delivery range');
      }
      if (max.lt(store.minOrderAmount) || (!requiresQuote && min.lt(store.minOrderAmount))) {
        throw new BadRequestException('Order is below the store minimum');
      }
      if (dto.redeemReward && await this.rewardBalance(tx, customerId) < 100) {
        throw new ConflictException('رصيد النقاط لا يكفي لاستخدام الخصم.');
      }
      const order = await tx.customerOrder.create({ data: {
        customerId, paymentMethod, storeId: store.storeId, idempotencyKey, requestHash, storeName: store.storeName,
        addressSnapshot: { id: address.id, label: address.label, address: address.address, latitude: address.latitude.toString(), longitude: address.longitude.toString() },
        itemSnapshots: snapshots, currency: 'ILS', estimatedMin: min, estimatedMax: max,
        minimumAmount: store.minOrderAmount, requiresQuote,
        ...(dto.redeemReward && { rewardPointsUsed: 100, rewardDiscountRate: 5 }),
        events: { create: { actorId: actor.user_id, actorRole: actor.role, version: 1, action: 'checkout', toStatus: 'PENDING', ...(note && { details: { note } }) } },
      } });
      await recordNotifications(tx, [store.ownerId], `order:${order.id}:1`, 'order.checkout', order.id);
      await tx.shoppingCart.update({ where: { customerId }, data: { storeId: null, items: [], version: { increment: 1 } } });
      return order;
    });
  }

  async list(actor: Actor, before?: number) {
    const rows = await this.db.customerOrder.findMany({
      where: { ...this.scope(actor), id: before ? { lt: before } : undefined },
      include: { store: { select: { logoUrl: true, coverImageUrl: true, storeNameAr: true } } }, orderBy: { id: 'desc' }, take: 51,
    });
    const page = rows.slice(0, 50);
    return { orders: page.map(order => this.view(order)), nextBefore: rows.length > 50 ? page[49].id : null };
  }

  async get(actor: Actor, id: number) {
    const order = await this.db.customerOrder.findFirst({
      where: { ...this.scope(actor), id }, include: { events: { orderBy: { version: 'asc' } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    return this.view(order);
  }

  view<T extends { idempotencyKey: string; requestHash: string; deliveryNonce: string | null }>(order: T) {
    const { idempotencyKey, requestHash, deliveryNonce, ...publicOrder } = order;
    return publicOrder;
  }

  private scope(actor: Actor): Prisma.CustomerOrderWhereInput {
    switch (actor.role) {
      case 'customer': return { customerId: actor.user_id };
      case 'store_owner': return { store: { ownerId: actor.user_id } };
      case 'driver': return { OR: [{ driverId: actor.user_id }, { offeredDriverId: actor.user_id, offerExpiresAt: { gt: new Date() } }] };
      case 'admin': return {};
    }
  }

  async act(actor: Actor, id: number, dto: OrderActionDto) {
    const result = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM customer_orders WHERE id = ${id} FOR UPDATE`;
      const where = { id, ...this.scope(actor) };
      const order = await tx.customerOrder.findFirst({ where });
      if (!order) throw new NotFoundException('Order not found');
      const { role } = actor;
      const rule = transitions[dto.action];
      if (!rule.roles.includes(role)) throw new ForbiddenException('Action not allowed for this role');
      if (dto.action === OrderAction.DELIVER && order.driverId === actor.user_id && order.status === 'DELIVERED' && order.version === dto.version + 1) {
        return this.view(order);
      }
      if (order.version !== dto.version || !rule.from.includes(order.status)) throw new ConflictException('Order changed or action is invalid in this state');
      const data: Prisma.CustomerOrderUncheckedUpdateManyInput = { status: rule.to, version: { increment: 1 } };
      const details: Prisma.InputJsonObject = {
        ...(dto.reason ? { reason: dto.reason } : {}),
        ...(dto.total !== undefined ? { total: new Prisma.Decimal(dto.total).toFixed(2) } : {}),
        ...(dto.driverId !== undefined ? { driverId: dto.driverId } : {}),
      };
      if (dto.action === OrderAction.ACCEPT) {
        if (order.requiresQuote) throw new ConflictException('A confirmed quote is required');
        data.finalTotal = order.estimatedMin;
      }
      if (dto.action === OrderAction.QUOTE) {
        const total = new Prisma.Decimal(dto.total!);
        if (total.lt(order.minimumAmount)) throw new BadRequestException('Quote is below the store minimum');
        data.proposedTotal = total;
      }
      if (dto.action === OrderAction.APPROVE_QUOTE) data.finalTotal = order.proposedTotal;
      if (dto.action === OrderAction.ASSIGN) {
        if (order.offerExpiresAt && order.offerExpiresAt > new Date()) throw new ConflictException('An offer is already active');
        await this.finance.assertEligibleDriver(tx, dto.driverId!);
        data.offeredDriverId = dto.driverId;
        data.offerExpiresAt = new Date(Date.now() + 5 * 60_000);
      }
      if (dto.action === OrderAction.ACCEPT_ASSIGNMENT || dto.action === OrderAction.DECLINE_ASSIGNMENT) {
        if (order.offeredDriverId !== actor.user_id || !order.offerExpiresAt || order.offerExpiresAt <= new Date()) {
          throw new ConflictException('Assignment offer is unavailable');
        }
        if (dto.action === OrderAction.ACCEPT_ASSIGNMENT) {
          await this.finance.assertEligibleDriver(tx, actor.user_id);
          data.driverId = actor.user_id;
          data.activeDriverId = actor.user_id;
        }
        data.offeredDriverId = null;
        data.offerExpiresAt = null;
      }
      if (dto.action === OrderAction.READY) await this.finance.assertReady(tx, order);
      if (dto.action === OrderAction.PICK_UP) {
        if (order.driverId !== actor.user_id) throw new ForbiddenException('Assigned driver required');
        data.deliveryNonce = randomUUID();
        data.deliveryCodeExpiresAt = new Date(Date.now() + 24 * 60 * 60_000);
      }
      if (dto.action === OrderAction.RESET_DELIVERY_CODE) {
        data.deliveryNonce = randomUUID();
        data.deliveryCodeExpiresAt = new Date(Date.now() + 24 * 60 * 60_000);
        data.deliveryCodeAttempts = 0;
      }
      if (dto.action === OrderAction.DELIVER) {
        if (order.driverId !== actor.user_id) throw new ForbiddenException('Assigned driver required');
        if (!order.deliveryNonce || !order.deliveryCodeExpiresAt || order.deliveryCodeExpiresAt <= new Date() || order.deliveryCodeAttempts >= 5) {
          throw new ConflictException('Delivery code unavailable');
        }
        const expected = Buffer.from(this.finance.deliveryCode(order.id, order.deliveryNonce));
        const received = Buffer.from(dto.deliveryCode ?? '');
        if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
          await tx.customerOrder.update({ where: { id }, data: { deliveryCodeAttempts: { increment: 1 } } });
          return null;
        }
        await this.finance.completeDelivery(tx, order, actor.user_id, dto.collectedAmount);
        data.activeDriverId = null;
        data.deliveryNonce = null;
        data.deliveryCodeExpiresAt = null;
      }
      if (dto.action === OrderAction.CANCEL) {
        await this.finance.cancelPayment(tx, id);
        data.activeDriverId = null;
        data.offeredDriverId = null;
        data.offerExpiresAt = null;
      }
      if (rule.to === 'ACCEPTED') {
        const total = new Prisma.Decimal(data.finalTotal as Prisma.Decimal);
        const discount = total.times(order.rewardDiscountRate).div(100).toDecimalPlaces(2);
        data.rewardDiscount = discount;
        const payable = total.minus(discount);
        data.finalTotal = payable;
        await this.finance.createPayment(tx, order, payable);
      }
      const updated = await tx.customerOrder.updateMany({ where: { ...where, version: dto.version }, data }).catch(error => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Driver already has an active delivery');
        throw error;
      });
      if (!updated.count) throw new ConflictException('Order changed');
      await tx.orderEvent.create({ data: {
        orderId: id, actorId: actor.user_id, actorRole: role, version: dto.version + 1,
        action: dto.action, fromStatus: order.status, toStatus: rule.to, details,
      } });
      const store = await tx.store.findUniqueOrThrow({ where: { storeId: order.storeId }, select: { ownerId: true } });
      const recipients = dto.action === OrderAction.ASSIGN ? [dto.driverId] : [order.customerId, store.ownerId, order.driverId, order.offeredDriverId];
      await recordNotifications(tx, recipients, `order:${id}:${dto.version + 1}`, `order.${dto.action}`, id, actor.user_id);
      return this.view(await tx.customerOrder.findUniqueOrThrow({ where: { id } }));
    });
    if (!result) throw new BadRequestException('Incorrect delivery code');
    return result;
  }

  async getDeliveryCode(actor: Actor, id: number) {
    const order = await this.db.customerOrder.findFirst({ where: { id, customerId: this.customer(actor), status: 'IN_TRANSIT' } });
    if (!order?.deliveryNonce || !order.deliveryCodeExpiresAt || order.deliveryCodeExpiresAt <= new Date()) throw new NotFoundException('Delivery code not available');
    return { code: this.finance.deliveryCode(order.id, order.deliveryNonce), expiresAt: order.deliveryCodeExpiresAt };
  }

  private async lockCustomer(tx: Prisma.TransactionClient, customerId: number) {
    await tx.$queryRaw`SELECT user_id FROM users WHERE user_id = ${customerId} FOR UPDATE`;
  }

  private async catalog(tx: Prisma.TransactionClient, items: CartItemDto[]) {
    const products = await tx.product.findMany({
      where: { productId: { in: items.map(item => item.productId) } }, include: { productOptions: true, store: true },
    });
    const byId = new Map(products.map(product => [product.productId, product]));
    const store = products[0]?.store;
    const uniqueLines = new Set<string>();
    let min = new Prisma.Decimal(0);
    let max = new Prisma.Decimal(0);
    let requiresQuote = false;
    const snapshots = items.map(item => {
      const product = byId.get(item.productId);
      if (!product?.isAvailable) throw new ConflictException('A product is unavailable');
      if (product.storeId !== store.storeId) throw new BadRequestException('Cart must contain products from one store');
      const lineKey = `${item.productId}:${[...item.optionIds].sort((a, b) => a - b).join(',')}`;
      if (uniqueLines.has(lineKey)) throw new BadRequestException('Duplicate cart item');
      uniqueLines.add(lineKey);
      const options = new Map(product.productOptions.map(option => [option.optionId, option]));
      let extra = new Prisma.Decimal(0);
      const selected = item.optionIds.map(id => {
        const option = options.get(id);
        if (!option?.isAvailable || option.extraCost.lt(0)) throw new ConflictException('A selected option is unavailable');
        extra = extra.plus(option.extraCost);
        return { optionId: id, name: option.optionName, nameAr: option.optionNameAr, extraCost: option.extraCost.toFixed(2) };
      });
      if (product.estimatedPriceMin.lt(0) || (!product.isPriceFixed && product.estimatedPriceMax.lt(product.estimatedPriceMin))) {
        throw new ConflictException('Product price is invalid');
      }
      const unitMin = product.estimatedPriceMin.plus(extra);
      const unitMax = (product.isPriceFixed ? product.estimatedPriceMin : product.estimatedPriceMax).plus(extra);
      min = min.plus(unitMin.times(item.quantity));
      max = max.plus(unitMax.times(item.quantity));
      requiresQuote ||= !product.isPriceFixed;
      return { productId: item.productId, nameAr: product.nameAr, nameEn: product.nameEn, quantity: item.quantity, unitMin: unitMin.toFixed(2), unitMax: unitMax.toFixed(2), options: selected };
    });
    if (max.gt('999999999999.99')) throw new BadRequestException('Order amount exceeds supported limit');
    return { store, snapshots, min, max, requiresQuote };
  }
}

const transitions: Record<OrderAction, { roles: UserRole[]; from: OrderStatus[]; to: OrderStatus }> = {
  accept: { roles: ['store_owner'], from: ['PENDING'], to: 'ACCEPTED' },
  quote: { roles: ['store_owner'], from: ['PENDING', 'QUOTED'], to: 'QUOTED' },
  approve_quote: { roles: ['customer'], from: ['QUOTED'], to: 'ACCEPTED' },
  reject: { roles: ['store_owner'], from: ['PENDING', 'QUOTED'], to: 'REJECTED' },
  cancel: { roles: ['customer', 'store_owner', 'admin'], from: ['PENDING', 'QUOTED', 'ACCEPTED', 'READY', 'ASSIGNED'], to: 'CANCELLED' },
  ready: { roles: ['store_owner'], from: ['ACCEPTED'], to: 'READY' },
  assign: { roles: ['admin'], from: ['READY'], to: 'READY' },
  accept_assignment: { roles: ['driver'], from: ['READY'], to: 'ASSIGNED' },
  decline_assignment: { roles: ['driver'], from: ['READY'], to: 'READY' },
  pick_up: { roles: ['driver'], from: ['ASSIGNED'], to: 'IN_TRANSIT' },
  deliver: { roles: ['driver'], from: ['IN_TRANSIT'], to: 'DELIVERED' },
  report_delivery_issue: { roles: ['driver'], from: ['IN_TRANSIT'], to: 'IN_TRANSIT' },
  reset_delivery_code: { roles: ['admin'], from: ['IN_TRANSIT'], to: 'IN_TRANSIT' },
};

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * radians / 2) ** 2 +
    Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin((lon2 - lon1) * radians / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}
