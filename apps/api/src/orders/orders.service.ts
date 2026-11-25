import { lockCustomer, priceCart } from './cart-pricing';
import { calculateDeliveryFee, distanceKm } from './delivery-pricing';
import { transitions } from './order-transitions';
import { recordNotifications } from '../notifications/record-notifications';
import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomerOrder, Prisma, UserRole } from '@prisma/client';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { FinanceService } from '../finance/finance.service';
import { PrismaService } from 'prisma/prisma.service';
import { CartItemDto, CheckoutDto, DeliveryQuoteDto, OrderAction, OrderActionDto } from './orders.dto';
import { DispatchService } from './dispatch.service';
import { OrderUpdates } from '../infrastructure/order-updates';

type Actor = { user_id: number; role: UserRole };

@Injectable()
export class OrdersService {
  constructor(
    private readonly db: PrismaService,
    private readonly finance: FinanceService,
    private readonly dispatch: DispatchService,
    private readonly updates: OrderUpdates,
    @Optional() private readonly config?: ConfigService,
  ) {}

  private customer(actor: Actor) {
    if (actor.role !== 'customer') throw new ForbiddenException('Customer account required');
    return actor.user_id;
  }

  private deliveryDefaults() {
    const baseFee = new Prisma.Decimal(this.config?.get('DELIVERY_BASE_FEE_ILS', '0') ?? '0');
    const perKmFee = new Prisma.Decimal(this.config?.get('DELIVERY_PER_KM_FEE_ILS', '0') ?? '0');
    if (!baseFee.isFinite() || baseFee.lt(0) || baseFee.decimalPlaces() > 2 || !perKmFee.isFinite() || perKmFee.lt(0) || perKmFee.decimalPlaces() > 2) {
      throw new ConflictException('Invalid delivery pricing configuration');
    }
    return { baseFee, perKmFee };
  }

  private async rewardBalance(db: { customerOrder: Pick<Prisma.TransactionClient['customerOrder'], 'groupBy'> }, customerId: number) {
    const rows = await db.customerOrder.groupBy({
      by: ['status'],
      where: { customerId, status: { notIn: ['CANCELLED', 'REJECTED'] } },
      _sum: { rewardPointsUsed: true, rewardPointsEarned: true },
    });
    const earned = rows.find(row => row.status === 'DELIVERED')?._sum.rewardPointsEarned ?? 0;
    return earned - rows.reduce((used, row) => used + (row._sum.rewardPointsUsed ?? 0), 0);
  }

  async rewards(actor: Actor) {
    return {
      balance: await this.rewardBalance(this.db, this.customer(actor)),
      pointsPerOrder: 10,
      bankTransferPointsPerOrder: 20,
      pointsRequired: 100,
      discountPercent: 5,
    };
  }

  async deliveryQuote(actor: Actor, dto: DeliveryQuoteDto) {
    const customerId = this.customer(actor);
    const [store, address] = await Promise.all([
      this.db.store.findUnique({
        where: { storeId: dto.storeId },
        select: {
          storeId: true, status: true, latitude: true, longitude: true,
          deliveryRangeKm: true, minOrderAmount: true,
          deliveryBaseFee: true, deliveryPerKmFee: true, freeDeliveryThreshold: true,
        },
      }),
      this.db.deliveryAddress.findFirst({ where: { id: dto.addressId, customerId } }),
    ]);
    if (!store || store.status !== 'ACTIVE') throw new NotFoundException('Store not found');
    if (!address) throw new NotFoundException('Address not found');
    if (store.latitude === null || store.longitude === null) {
      throw new ConflictException('موقع المتجر غير محدد. تواصل مع المتجر لتحديث موقعه قبل الطلب.');
    }
    const rawDistance = distanceKm(+store.latitude, +store.longitude, +address.latitude, +address.longitude);
    const pricing = calculateDeliveryFee(rawDistance, new Prisma.Decimal(dto.itemsSubtotal ?? 0), store, this.deliveryDefaults());
    return {
      storeId: store.storeId,
      addressId: address.id,
      deliveryDistanceKm: pricing.distanceKm.toFixed(2),
      deliveryRangeKm: store.deliveryRangeKm.toString(),
      withinRange: rawDistance <= +store.deliveryRangeKm,
      deliveryFee: pricing.deliveryFee.toFixed(2),
      freeDeliveryApplied: pricing.freeDeliveryApplied,
      freeDeliveryThreshold: store.freeDeliveryThreshold?.toString() ?? null,
      minimumAmount: store.minOrderAmount.toString(),
    };
  }

  async checkout(actor: Actor, key: string | undefined, dto: CheckoutDto) {
    const customerId = this.customer(actor);
    if (!key || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) throw new BadRequestException('Invalid Idempotency-Key');
    const idempotencyKey = key.toLowerCase();
    const paymentMethod = dto.paymentMethod ?? 'CASH';
    const note = dto.note?.trim();
    const requestHash = createHash('sha256').update(`${dto.cartVersion}:${dto.addressId}${paymentMethod === 'CASH' ? '' : `:${paymentMethod}`}${dto.redeemReward ? ':reward' : ''}${note ? `:note:${note}` : ''}`).digest('hex');
    const { order, ownerId } = await this.db.$transaction(async tx => {
      await lockCustomer(tx, customerId);
      const existing = await tx.customerOrder.findUnique({ where: { customerId_idempotencyKey: { customerId, idempotencyKey } } });
      if (existing) {
        if (existing.requestHash !== requestHash) throw new ConflictException('Idempotency key already used for different checkout');
        return { order: existing, ownerId: null };
      }
      this.finance.assertEnabled(paymentMethod);
      const cart = await tx.shoppingCart.findUnique({ where: { customerId } });
      if (!cart || cart.version !== dto.cartVersion) throw new ConflictException('Cart has changed');
      const items = cart.items as unknown as CartItemDto[];
      if (!items.length) throw new BadRequestException('Cart is empty');
      const address = await tx.deliveryAddress.findFirst({ where: { id: dto.addressId, customerId } });
      if (!address) throw new NotFoundException('Address not found');
      const { store, snapshots, min, max, requiresQuote } = await priceCart(tx, items);
      if (store.status !== 'ACTIVE' || !store.isOpenNow) throw new ConflictException('Store is not accepting orders');
      if (store.latitude === null || store.longitude === null) throw new ConflictException('موقع المتجر غير محدد. تواصل مع المتجر لتحديث موقعه قبل الطلب.');
      const deliveryDistance = distanceKm(+store.latitude, +store.longitude, +address.latitude, +address.longitude);
      if (deliveryDistance > +store.deliveryRangeKm) {
        throw new BadRequestException(`العنوان خارج نطاق توصيل المتجر. المسافة المحسوبة ${deliveryDistance.toFixed(1)} كم، والنطاق المتاح ${Number(store.deliveryRangeKm)} كم. تأكد من موقع عنوانك، واطلب من المتجر مراجعة موقعه إذا كانت المسافة غير صحيحة.`);
      }
      if (max.lt(store.minOrderAmount) || (!requiresQuote && min.lt(store.minOrderAmount))) {
        throw new BadRequestException('Order is below the store minimum');
      }
      if (dto.redeemReward && await this.rewardBalance(tx, customerId) < 100) {
        throw new ConflictException('رصيد النقاط لا يكفي لاستخدام الخصم.');
      }
      const deliveryPricing = calculateDeliveryFee(deliveryDistance, min, store, this.deliveryDefaults());
      const order = await tx.customerOrder.create({ data: {
        customerId, paymentMethod, storeId: store.storeId, idempotencyKey, requestHash, storeName: store.storeName,
        addressSnapshot: { id: address.id, label: address.label, address: address.address, latitude: address.latitude.toString(), longitude: address.longitude.toString(), area: address.area, residenceType: address.residenceType, building: address.building, floor: address.floor, street: address.street, phone: address.phone, directions: address.directions },
        itemSnapshots: snapshots, currency: 'ILS', estimatedMin: min, estimatedMax: max,
        deliveryDistanceKm: deliveryPricing.distanceKm, deliveryFee: deliveryPricing.deliveryFee,
        rewardPointsEarned: paymentMethod === 'BANK_TRANSFER' ? 20 : 10,
        minimumAmount: store.minOrderAmount, requiresQuote,
        ...(dto.redeemReward && { rewardPointsUsed: 100, rewardDiscountRate: 5 }),
        events: { create: { actorId: actor.user_id, actorRole: actor.role, version: 1, action: 'checkout', toStatus: 'PENDING', ...(note && { details: { note } }) } },
      } });
      await recordNotifications(tx, [store.ownerId], `order:${order.id}:1`, 'order.checkout', order.id);
      await tx.shoppingCart.update({ where: { customerId }, data: { storeId: null, items: [], version: { increment: 1 } } });
      return { order, ownerId: store.ownerId };
    });
    if (ownerId !== null) this.updates.publish([ownerId, customerId]);
    return order;
  }

  async list(actor: Actor, before?: number) {
    const rows = await this.db.customerOrder.findMany({
      where: { ...this.scope(actor), id: before ? { lt: before } : undefined },
      include: {
        store: { select: { logoUrl: true, coverImageUrl: true, storeNameAr: true } },
        payment: actor.role === 'driver'
          ? false
          : {
              select: {
                status: true,
                recipientPhone: true,
                storeCollected: true,
                receipt: {
                  select: {
                    submittedAt: true,
                    verificationStatus: true,
                    riskLevel: true,
                    reportReason: true,
                    decision: true,
                  },
                },
              },
            },
      },
      orderBy: { id: 'desc' },
      take: 51,
    });
    const page = rows.slice(0, 50);
    return { orders: page.map(order => this.view(order, actor)), nextBefore: rows.length > 50 ? page[49].id : null };
  }

  async get(actor: Actor, id: number) {
    const order = await this.db.customerOrder.findFirst({
      where: { ...this.scope(actor), id },
      include: {
        events: { orderBy: { version: 'asc' } },
        store: {
          select: {
            fullAddressAr: true,
            fullAddress: true,
            latitude: true,
            longitude: true,
            phone: true,
            ...(actor.role !== 'driver' && { bankTransferPhone: true }),
          },
        },
        payment: actor.role === 'driver'
          ? false
          : {
              select: {
                status: true,
                recipientPhone: true,
                storeCollected: true,
                receipt: {
                  select: {
                    submittedAt: true,
                    verificationStatus: true,
                    riskLevel: true,
                    reportReason: true,
                    decision: true,
                  },
                },
              },
            },
        deliveryCompany: { select: { name: true } },
        customer: actor.role === 'store_owner' || actor.role === 'admin'
          ? { select: { user_id: true, full_name: true, full_name_ar: true, phone: true, is_active: true } }
          : false,
      },
    });
    if (order) {
      const deliveryCompanies = actor.role === 'store_owner' && ['PENDING', 'QUOTED'].includes(order.status)
        ? await this.db.deliveryCompany.findMany({
          where: { contracts: { some: { storeId: order.storeId, confirmed: true } }, manager: { role: 'store_owner', is_active: true, is_verified: true } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
        : undefined;
      const deliveryCompanyAvailable = order.status === 'QUOTED' && order.deliveryCompanyId !== null
        ? (deliveryCompanies
          ? deliveryCompanies.some(company => company.id === order.deliveryCompanyId)
          : await this.hasActiveDeliveryContract(this.db, order.storeId, order.deliveryCompanyId))
        : undefined;
      return { ...this.view(order, actor), ...(deliveryCompanies && { deliveryCompanies }), deliveryCompanyAvailable };
    }
    if (actor.role === 'driver') {
      const [offer] = await this.dispatch.independentOffers(actor, id);
      if (offer) return offer;
    }
    if (actor.role === 'store_owner') {
      const companyOrder = await this.db.customerOrder.findFirst({
        where: { id, dispatchOpenedAt: { not: null }, deliveryCompany: { managerId: actor.user_id } },
        select: { id: true, storeId: true, storeName: true, version: true, status: true, createdAt: true },
      });
      if (companyOrder) return { ...companyOrder, offerOnly: true, companyView: true };
    }
    throw new NotFoundException('Order not found');
  }

  view<T extends Pick<import('@prisma/client').CustomerOrder, 'id' | 'idempotencyKey' | 'requestHash' | 'deliveryNonce' | 'driverId' | 'storeId' | 'storeName' | 'status' | 'version' | 'offerExpiresAt' | 'offeredDriverId' | 'createdAt'>>(order: T, actor?: Actor) {
    if (actor?.role === 'driver' && order.driverId !== actor.user_id) {
      const { id, storeId, storeName, status, version, offerExpiresAt, offeredDriverId, createdAt } = order;
      return { id, storeId, storeName, status, version, offerExpiresAt, offeredDriverId, createdAt, offerOnly: true };
    }
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
    const { role } = actor;
    const rule = transitions[dto.action];
    const claim = dto.action === OrderAction.CLAIM_DELIVERY;
    const companyAssign = dto.action === OrderAction.COMPANY_ASSIGN;
    const reroute = dto.action === OrderAction.REROUTE_DELIVERY;
    if ((claim || companyAssign) && !rule.roles.includes(role)) throw new ForbiddenException('Action not allowed for this role');
    const result = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM customer_orders WHERE id = ${id} FOR UPDATE`;
      const where: Prisma.CustomerOrderWhereInput = claim
        ? { id, deliveryCompanyId: null, dispatchOpenedAt: { not: null }, driverId: null, status: { in: rule.from } }
        : companyAssign
          ? { id, deliveryCompany: { managerId: actor.user_id }, dispatchOpenedAt: { not: null } }
          : { id, ...this.scope(actor) };
      const order = await tx.customerOrder.findFirst({ where });
      if (!order && claim) throw new ConflictException('Delivery offer is unavailable');
      if (!order) throw new NotFoundException('Order not found');
      if (!rule.roles.includes(role)) throw new ForbiddenException('Action not allowed for this role');
      if (dto.action === OrderAction.DELIVER && order.driverId === actor.user_id && order.status === 'DELIVERED' && order.version === dto.version + 1) {
        return { value: this.view(order, actor), change: null };
      }
      if (order.version !== dto.version || !rule.from.includes(order.status)) throw new ConflictException('Order changed or action is invalid in this state');
      const { toStatus, data, details, delivered } = await this.applyOrderAction(tx, actor, order, dto);
      if (!delivered) return null;
      const updated = await tx.customerOrder.updateMany({ where: { ...where, version: dto.version }, data }).catch(error => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Driver already has an active delivery');
        throw error;
      });
      if (!updated.count) throw new ConflictException('Order changed');
      await tx.orderEvent.create({ data: {
        orderId: id, actorId: actor.user_id, actorRole: role, version: dto.version + 1,
        action: dto.action, fromStatus: order.status, toStatus, details,
      } });
      const updatedOrder = await tx.customerOrder.findUniqueOrThrow({
        where: { id }, include: { store: { select: { ownerId: true } }, deliveryCompany: { select: { managerId: true } } },
      });
      const recipients = dto.action === OrderAction.ASSIGN
        ? [dto.driverId]
        : [order.customerId, updatedOrder.store.ownerId, updatedOrder.driverId ?? order.offeredDriverId,
          updatedOrder.dispatchOpenedAt ? updatedOrder.deliveryCompany?.managerId : null];
      await recordNotifications(tx, recipients, `order:${id}:${dto.version + 1}`, `order.${dto.action}`, id, actor.user_id);
      const { store: _store, deliveryCompany: _company, ...updatedState } = updatedOrder;
      const independentOffer = (state: typeof updatedState) => state.deliveryCompanyId === null && state.driverId === null &&
        !!state.dispatchOpenedAt && (state.status === 'ACCEPTED' || state.status === 'READY');
      return {
        value: companyAssign ? { id, status: toStatus, version: updatedOrder.version, driverId: updatedOrder.driverId } : this.view(updatedState, actor),
        change: { users: [...recipients, order.customerId, updatedOrder.store.ownerId, actor.user_id], independent: independentOffer(order) || independentOffer(updatedState) },
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    if (!result) throw new BadRequestException('Incorrect delivery code');
    if (result.change) this.updates.publish(result.change.users, result.change.independent);
    return result.value;
  }

  private async applyOrderAction(
    tx: Prisma.TransactionClient,
    actor: Actor,
    order: CustomerOrder,
    dto: OrderActionDto,
  ): Promise<{
    toStatus: CustomerOrder['status'];
    data: Prisma.CustomerOrderUncheckedUpdateManyInput;
    details: Prisma.InputJsonObject;
    delivered: boolean;
  }> {
    const rule = transitions[dto.action];
    const claim = dto.action === OrderAction.CLAIM_DELIVERY;
    const companyAssign = dto.action === OrderAction.COMPANY_ASSIGN;
    const reroute = dto.action === OrderAction.REROUTE_DELIVERY;

    let toStatus = rule.to;
    if ((claim || companyAssign) && order.status === 'ACCEPTED') toStatus = 'ACCEPTED';
    if (dto.action === OrderAction.READY && order.driverId !== null) toStatus = 'ASSIGNED';
    if (reroute) toStatus = order.status;

    const data: Prisma.CustomerOrderUncheckedUpdateManyInput = { status: toStatus, version: { increment: 1 } };
    const details: Prisma.InputJsonObject = {
      ...(dto.reason ? { reason: dto.reason } : {}),
      ...(dto.total !== undefined ? { total: new Prisma.Decimal(dto.total).toFixed(2) } : {}),
      ...(dto.driverId !== undefined ? { driverId: dto.driverId } : {}),
      ...(reroute ? { previousDeliveryCompanyId: order.deliveryCompanyId } : {}),
    };

    if ([OrderAction.ACCEPT, OrderAction.QUOTE, OrderAction.APPROVE_QUOTE].includes(dto.action)) {
      await this.resolveCompanySelection(tx, order, dto.action, dto.deliveryCompanyId, data);
    }
    if (reroute) {
      if (order.deliveryCompanyId === null || order.driverId !== null) {
        throw new ConflictException('Only unassigned company deliveries can be rerouted');
      }
      data.deliveryCompanyId = null;
      data.dispatchOpenedAt = order.dispatchOpenedAt ? new Date() : null;
      data.offeredDriverId = null;
      data.offerExpiresAt = null;
    }
    if (dto.action === OrderAction.ACCEPT) {
      if (order.requiresQuote) throw new ConflictException('A confirmed quote is required');
      data.finalTotal = order.estimatedMin;
    }
    if (dto.action === OrderAction.QUOTE) {
      const total = new Prisma.Decimal(dto.total!);
      if (total.lt(order.minimumAmount)) throw new BadRequestException('Quote is below the store minimum');
      data.proposedTotal = total;
      const updatedPricing = await this.recomputeOrderDeliveryFee(tx, order, total);
      data.deliveryFee = updatedPricing.deliveryFee;
    }
    if (dto.action === OrderAction.APPROVE_QUOTE) {
      const approvedTotal = new Prisma.Decimal(order.proposedTotal!);
      data.finalTotal = approvedTotal;
      const updatedPricing = await this.recomputeOrderDeliveryFee(tx, order, approvedTotal);
      data.deliveryFee = updatedPricing.deliveryFee;
    }

    await this.applyAssignmentAction(tx, actor, order, dto, data);

    if (dto.action === OrderAction.READY) {
      await this.finance.assertReady(tx, order);
      if (!order.dispatchOpenedAt) data.dispatchOpenedAt = new Date();
    }
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
      const verified = await this.handleDeliverAction(tx, actor, order, dto, data);
      if (!verified) return { toStatus, data, details, delivered: false };
    }
    if (dto.action === OrderAction.CANCEL || dto.action === OrderAction.CONFIRM_RETURN) {
      await this.finance.cancelPayment(tx, order.id);
      data.activeDriverId = null;
      data.deliveryNonce = null;
      data.deliveryCodeExpiresAt = null;
      data.offeredDriverId = null;
      data.offerExpiresAt = null;
    }
    if ([OrderAction.ACCEPT, OrderAction.APPROVE_QUOTE].includes(dto.action)) {
      await this.finalizeAcceptedOrder(tx, order, data);
    }

    return { toStatus, data, details, delivered: true };
  }

  private async resolveCompanySelection(
    tx: Prisma.TransactionClient,
    order: CustomerOrder,
    action: OrderAction,
    deliveryCompanyId: number | null | undefined,
    data: Prisma.CustomerOrderUncheckedUpdateManyInput,
  ) {
    const choice = action === OrderAction.APPROVE_QUOTE ? undefined : deliveryCompanyId;
    const companyId = choice === undefined ? order.deliveryCompanyId : choice;
    if (companyId !== null && !await this.hasActiveDeliveryContract(tx, order.storeId, companyId, true)) {
      throw new ConflictException('The selected delivery company is unavailable. A new quote or delivery selection is required.');
    }
    if (choice !== undefined) data.deliveryCompanyId = choice;
  }

  private async applyAssignmentAction(
    tx: Prisma.TransactionClient,
    actor: Actor,
    order: CustomerOrder,
    dto: OrderActionDto,
    data: Prisma.CustomerOrderUncheckedUpdateManyInput,
  ) {
    if (dto.action === OrderAction.ASSIGN) {
      if (order.offerExpiresAt && order.offerExpiresAt > new Date()) throw new ConflictException('An offer is already active');
      const driver = await this.finance.assertEligibleDriver(tx, dto.driverId!);
      if (order.deliveryCompanyId !== null || driver.deliveryCompanyId !== null) throw new ConflictException('Manual offers require an independent driver and order');
      data.offeredDriverId = dto.driverId;
      data.offerExpiresAt = new Date(Date.now() + 5 * 60_000);
      return;
    }
    if (dto.action === OrderAction.ACCEPT_ASSIGNMENT || dto.action === OrderAction.DECLINE_ASSIGNMENT) {
      if (order.offeredDriverId !== actor.user_id || !order.offerExpiresAt || order.offerExpiresAt <= new Date()) {
        throw new ConflictException('Assignment offer is unavailable');
      }
      if (dto.action === OrderAction.ACCEPT_ASSIGNMENT) {
        const driver = await this.finance.assertEligibleDriver(tx, actor.user_id);
        if (driver.deliveryCompanyId !== order.deliveryCompanyId) throw new ConflictException('Driver is no longer eligible for this order');
        data.driverId = actor.user_id;
        data.activeDriverId = actor.user_id;
      }
      data.offeredDriverId = null;
      data.offerExpiresAt = null;
      return;
    }
    const claim = dto.action === OrderAction.CLAIM_DELIVERY;
    const companyAssign = dto.action === OrderAction.COMPANY_ASSIGN;
    if (claim || companyAssign) {
      if (order.driverId !== null) throw new ConflictException('A driver is already assigned');
      const driverId = claim ? actor.user_id : dto.driverId!;
      const driver = await this.finance.assertEligibleDriver(tx, driverId);
      if (driver.deliveryCompanyId !== order.deliveryCompanyId) throw new ConflictException('Driver is not eligible for this order');
      if (claim) {
        const [offer] = await this.dispatch.independentOffers(actor, order.id, tx);
        if (!offer?.openOffer.canClaim) throw new ConflictException('Delivery offer is unavailable or reserved for the nearest driver');
      }
      data.driverId = driverId;
      data.activeDriverId = driverId;
    }
  }

  private async handleDeliverAction(
    tx: Prisma.TransactionClient,
    actor: Actor,
    order: CustomerOrder,
    dto: OrderActionDto,
    data: Prisma.CustomerOrderUncheckedUpdateManyInput,
  ) {
    if (order.driverId !== actor.user_id) throw new ForbiddenException('Assigned driver required');
    if (!order.deliveryNonce || !order.deliveryCodeExpiresAt || order.deliveryCodeExpiresAt <= new Date() || order.deliveryCodeAttempts >= 5) {
      throw new ConflictException('Delivery code unavailable');
    }
    const expected = Buffer.from(this.finance.deliveryCode(order.id, order.deliveryNonce));
    const received = Buffer.from(dto.deliveryCode ?? '');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      await tx.customerOrder.update({ where: { id: order.id }, data: { deliveryCodeAttempts: { increment: 1 } } });
      return false;
    }
    await this.finance.completeDelivery(tx, order, actor.user_id, dto.collectedAmount);
    await this.incrementSoldQuantities(tx, order);
    data.activeDriverId = null;
    data.deliveryNonce = null;
    data.deliveryCodeExpiresAt = null;
    return true;
  }

  private async incrementSoldQuantities(tx: Prisma.TransactionClient, order: CustomerOrder) {
    const rawItems = Array.isArray(order.itemSnapshots) ? order.itemSnapshots : [];
    const productIds = Array.from(new Set(
      rawItems
        .map(item => (item && typeof item === 'object' && 'productId' in item ? Number((item as { productId: unknown }).productId) : 0))
        .filter(productId => Number.isInteger(productId) && productId > 0),
    )).sort((a, b) => a - b);
    if (!productIds.length) return;
    await tx.$queryRaw`
      SELECT product_id FROM products
      WHERE store_id = ${order.storeId} AND product_id IN (${Prisma.join(productIds)})
      ORDER BY product_id ASC FOR UPDATE`;
    await tx.$executeRaw`
      UPDATE products p
      JOIN (
        SELECT item.productId, SUM(item.quantity) AS sold
        FROM JSON_TABLE(${JSON.stringify(order.itemSnapshots)}, '$[*]' COLUMNS (
          productId INT PATH '$.productId', quantity INT PATH '$.quantity'
        )) item WHERE item.quantity > 0 GROUP BY item.productId
      ) totals ON totals.productId = p.product_id
      SET p.sold_quantity = p.sold_quantity + totals.sold
      WHERE p.store_id = ${order.storeId}`;
  }

  private async recomputeOrderDeliveryFee(
    tx: Prisma.TransactionClient,
    order: Pick<CustomerOrder, 'storeId' | 'deliveryDistanceKm'>,
    itemsSubtotal: Prisma.Decimal,
  ) {
    const store = await tx.store.findUniqueOrThrow({
      where: { storeId: order.storeId },
      select: { deliveryBaseFee: true, deliveryPerKmFee: true, freeDeliveryThreshold: true },
    });
    return calculateDeliveryFee(Number(order.deliveryDistanceKm ?? 0), itemsSubtotal, store, this.deliveryDefaults());
  }

  private async finalizeAcceptedOrder(
    tx: Prisma.TransactionClient,
    order: CustomerOrder,
    data: Prisma.CustomerOrderUncheckedUpdateManyInput,
  ) {
    const itemsTotal = new Prisma.Decimal(data.finalTotal as Prisma.Decimal);
    const discount = itemsTotal.times(order.rewardDiscountRate).div(100).toDecimalPlaces(2);
    data.rewardDiscount = discount;
    const deliveryFee = data.deliveryFee !== undefined
      ? new Prisma.Decimal(data.deliveryFee as Prisma.Decimal)
      : order.deliveryFee;
    const payable = itemsTotal.minus(discount).plus(deliveryFee);
    data.finalTotal = payable;
    const resolvedCompanyId = data.deliveryCompanyId !== undefined
      ? (data.deliveryCompanyId as number | null)
      : order.deliveryCompanyId;
    await this.finance.createPayment(tx, { ...order, deliveryFee }, payable, { deliveryCompanyId: resolvedCompanyId });
    if (order.paymentMethod === 'CASH') data.dispatchOpenedAt = new Date();
  }

  async getDeliveryCode(actor: Actor, id: number) {
    const order = await this.db.customerOrder.findFirst({ where: { id, customerId: this.customer(actor), status: 'IN_TRANSIT' } });
    if (!order?.deliveryNonce || !order.deliveryCodeExpiresAt || order.deliveryCodeExpiresAt <= new Date()) throw new NotFoundException('Delivery code not available');
    return { code: this.finance.deliveryCode(order.id, order.deliveryNonce), expiresAt: order.deliveryCodeExpiresAt };
  }

  private async hasActiveDeliveryContract(db: Pick<Prisma.TransactionClient, '$queryRaw'>, storeId: number, companyId: number, lock = false) {
    const [contract] = await db.$queryRaw<{ storeId: number }[]>`
      SELECT contract.storeId FROM store_delivery_contracts AS contract
      JOIN delivery_companies AS company ON company.id = contract.deliveryCompanyId
      JOIN users AS manager ON manager.user_id = company.managerId
      WHERE contract.storeId = ${storeId} AND company.id = ${companyId} AND contract.confirmed = TRUE
        AND manager.role = 'store_owner' AND manager.is_active = TRUE AND manager.is_verified = TRUE
      ${lock ? Prisma.sql`FOR SHARE` : Prisma.empty}
    `;
    return Boolean(contract);
  }


}
