import { recordNotifications } from '../notifications/record-notifications';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomerOrder, PaymentMethod, Prisma, UserRole } from '@prisma/client';
import { createHmac, randomUUID } from 'crypto';
import { PrismaService } from 'prisma/prisma.service';

type Actor = { user_id: number; role: UserRole };
type Tx = Prisma.TransactionClient;

@Injectable()
export class FinanceService {
  constructor(private readonly db: PrismaService, private readonly config: ConfigService) {}

  assertEnabled(method: PaymentMethod) {
    if (method === 'BANK_TRANSFER' && !['BANK_TRANSFER_INSTRUCTIONS', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'].every(key => this.config.get(key))) {
      throw new ConflictException('Bank transfer is not configured');
    }
    if (method === 'ELECTRONIC' && !this.sandboxEnabled()) throw new ConflictException('Electronic payment is not configured');
  }

  sandboxEnabled() {
    return this.config.get('NODE_ENV') !== 'production' && Boolean(this.config.get('PAYMENT_SANDBOX_SECRET'));
  }

  deliveryCode(orderId: number, nonce: string) {
    const digest = createHmac('sha256', this.config.getOrThrow<string>('DELIVERY_CODE_SECRET')).update(`${orderId}:${nonce}`).digest();
    return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, '0');
  }

  async setDriverApproval(actor: Actor, driverId: number, approved: boolean) {
    this.admin(actor);
    const driver = await this.db.user.findFirst({ where: { user_id: driverId, role: 'driver', is_active: true, is_verified: true } });
    if (!driver) throw new NotFoundException('Driver not found');
    return this.db.driverProfile.upsert({ where: { userId: driverId }, create: { userId: driverId, approved }, update: { approved, ...(!approved ? { available: false } : {}) } });
  }

  async setAvailability(actor: Actor, available: boolean) {
    if (actor.role !== 'driver') throw new ForbiddenException();
    const updated = await this.db.driverProfile.updateMany({ where: { userId: actor.user_id, approved: true }, data: { available } });
    if (!updated.count) throw new ForbiddenException('Driver approval required');
    return { available };
  }

  async assertEligibleDriver(tx: Tx, id: number) {
    const driver = await tx.driverProfile.findFirst({ where: { userId: id, approved: true, available: true, user: { role: 'driver', is_active: true, is_verified: true } } });
    if (!driver) throw new ConflictException('Driver must be approved and available');
    if (await tx.customerOrder.findUnique({ where: { activeDriverId: id }, select: { id: true } })) throw new ConflictException('Driver already has an active delivery');
  }

  async createPayment(tx: Tx, order: CustomerOrder, amount: Prisma.Decimal) {
    const bps = Number(this.config.get('PLATFORM_COMMISSION_BPS', '0'));
    const driverShare = new Prisma.Decimal(this.config.get('DRIVER_FEE_ILS', '0'));
    if (!Number.isInteger(bps) || bps < 0 || bps > 10000 || !driverShare.isFinite() || driverShare.lt(0) || driverShare.decimalPlaces() > 2) {
      throw new ConflictException('Invalid payout configuration');
    }
    const platformShare = amount.times(bps).div(10000).toDecimalPlaces(2);
    const storeShare = amount.minus(platformShare).minus(driverShare);
    if (storeShare.lt(0)) throw new ConflictException('Payouts exceed order total');
    return tx.payment.create({ data: {
      orderId: order.id, amount, currency: order.currency, method: order.paymentMethod,
      bankCode: order.paymentMethod === 'BANK_TRANSFER' ? randomUUID() : null,
      driverShare, platformShare, storeShare,
    } });
  }

  async assertReady(tx: Tx, order: CustomerOrder) {
    let payment = await tx.payment.findUnique({ where: { orderId: order.id } });
    if (!payment && order.paymentMethod === 'CASH' && order.finalTotal) payment = await this.createPayment(tx, order, order.finalTotal);
    if (!payment || (payment.method !== 'CASH' && payment.status !== 'PAID')) throw new ConflictException('Payment must be confirmed first');
  }

  async completeDelivery(tx: Tx, order: CustomerOrder, actorId: number, collectedAmount?: number) {
    let payment = await tx.payment.findUnique({ where: { orderId: order.id } });
    if (!payment && order.paymentMethod === 'CASH' && order.finalTotal) payment = await this.createPayment(tx, order, order.finalTotal);
    if (!payment) throw new ConflictException('Payment missing');
    if (payment.method === 'CASH') {
      if (payment.status !== 'DUE' || collectedAmount === undefined || !payment.amount.eq(collectedAmount)) {
        throw new BadRequestException('Collected cash must equal the full amount due');
      }
      await tx.payment.update({ where: { orderId: order.id }, data: { status: 'PAID', collectedBy: actorId, collectedAt: new Date() } });
      await this.entry(tx, order.id, 'COLLECTION', `cash:driver:${actorId}`, 'order:clearing', payment.amount, actorId);
    } else if (payment.status !== 'PAID' || collectedAmount !== undefined) {
      throw new ConflictException('Confirmed non-cash payment required');
    }
    await this.entry(tx, order.id, 'STORE_PAYABLE', 'order:clearing', `store:payable:${order.storeId}`, payment.storeShare, actorId);
    await this.entry(tx, order.id, 'DRIVER_PAYABLE', 'order:clearing', `driver:payable:${actorId}`, payment.driverShare, actorId);
    await this.entry(tx, order.id, 'PLATFORM_REVENUE', 'order:clearing', 'platform:revenue', payment.platformShare, actorId);
  }

  async cancelPayment(tx: Tx, orderId: number) {
    await tx.payment.updateMany({ where: { orderId, status: 'DUE' }, data: { status: 'VOID' } });
    await tx.payment.updateMany({ where: { orderId, status: 'PAID' }, data: { status: 'REFUND_REQUIRED' } });
  }

  async status(actor: Actor, id: number) {
    const order = await this.db.customerOrder.findFirst({ where: { id, ...(actor.role === 'admin' ? {} : { customerId: actor.user_id }) }, include: { payment: { include: { entries: { orderBy: { id: 'asc' } } } } } });
    if (!order?.payment) throw new NotFoundException('Payment not found');
    const p = order.payment;
    if (actor.role === 'admin') return p;
    return {
      method: p.method, status: p.status, amount: p.amount, currency: p.currency, collectedAt: p.collectedAt,
      ...(p.method === 'BANK_TRANSFER' && p.status === 'DUE' ? {
        bankInstructions: this.config.get('BANK_TRANSFER_INSTRUCTIONS'),
        whatsappText: `WASLA ${p.bankCode}`, whatsappReceived: !!p.whatsappReceivedAt,
      } : {}),
    };
  }

  async acknowledgeWhatsApp(code: string, messageId: string) {
    try {
      await this.db.payment.updateMany({ where: { bankCode: code, method: 'BANK_TRANSFER', whatsappReceivedAt: null }, data: { whatsappReceivedAt: new Date(), whatsappMessageId: messageId } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
  }

  async reconcileBank(actor: Actor, id: number, amount: number, currency: string, reference: string) {
    this.admin(actor);
    return this.confirmIncoming(id, 'BANK_TRANSFER', amount, currency, reference, actor.user_id);
  }

  async confirmIncoming(id: number, method: 'BANK_TRANSFER' | 'ELECTRONIC', amount: number, currency: string, reference: string, actorId: number) {
    try {
      return await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM customer_orders WHERE id = ${id} FOR UPDATE`;
        const payment = await tx.payment.findUnique({ where: { orderId: id } });
        if (!payment || payment.method !== method) throw new NotFoundException('Payment not found');
        if (method === 'BANK_TRANSFER' && !payment.whatsappReceivedAt) throw new ConflictException('WhatsApp notification has not been received');
        if (!payment.amount.eq(amount) || payment.currency !== currency) throw new BadRequestException('Bank amount or currency does not match');
        const ref = `${method}:${reference}`;
        if (payment.bankReference === ref) return { status: payment.status };
        if (!['DUE', 'VOID'].includes(payment.status)) throw new ConflictException('Payment already processed');
        const status = payment.status === 'VOID' ? 'REFUND_REQUIRED' : 'PAID';
        await tx.payment.update({ where: { orderId: id }, data: { status, bankReference: ref, collectedAt: new Date(), collectedBy: actorId || null } });
        await this.entry(tx, id, 'COLLECTION', method === 'BANK_TRANSFER' ? 'platform:bank' : 'provider:clearing', 'order:clearing', payment.amount, actorId);
        const order = await tx.customerOrder.findUniqueOrThrow({ where: { id }, select: { customerId: true, store: { select: { ownerId: true } } } });
        await recordNotifications(tx, [order.customerId, order.store.ownerId], `payment:${id}:confirmed`, `payment.${status.toLowerCase()}`, id);
        return { status };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Transfer reference already used');
      throw error;
    }
  }

  async settle(actor: Actor, id: number, kind: 'cash_handover' | 'store_payout' | 'driver_payout', reference: string) {
    this.admin(actor);
    try {
      return await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM customer_orders WHERE id = ${id} FOR UPDATE`;
        const p = await tx.payment.findUnique({ where: { orderId: id }, include: { order: true } });
        if (!p || p.order.status !== 'DELIVERED' || p.status !== 'PAID') throw new ConflictException('Delivered and paid order required');
        if (kind === 'cash_handover' && (p.method !== 'CASH' || !p.collectedBy)) throw new ConflictException('No cash custody to settle');
        if (kind !== 'cash_handover' && p.method === 'CASH' && !p.cashHandedOverAt) throw new ConflictException('Cash handover required first');
        const previous = await tx.paymentEntry.findUnique({ where: { orderId_kind: { orderId: id, kind } } });
        if (previous?.reference === reference) return previous;
        if (previous) throw new ConflictException('Settlement already recorded');
        if (kind === 'cash_handover') {
          await tx.payment.update({ where: { orderId: id }, data: { cashHandedOverAt: new Date(), cashHandedOverBy: actor.user_id } });
          return this.entry(tx, id, kind, 'platform:cash', `cash:driver:${p.collectedBy}`, p.amount, actor.user_id, reference);
        }
        return kind === 'store_payout'
          ? this.entry(tx, id, kind, `store:payable:${p.order.storeId}`, 'platform:bank', p.storeShare, actor.user_id, reference)
          : this.entry(tx, id, kind, `driver:payable:${p.order.driverId}`, 'platform:bank', p.driverShare, actor.user_id, reference);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Settlement reference already used');
      throw error;
    }
  }

  private entry(tx: Tx, orderId: number, kind: string, debit: string, credit: string, amount: Prisma.Decimal, actorId: number, reference?: string) {
    return tx.paymentEntry.create({ data: { orderId, kind, debit, credit, amount, actorId, reference } });
  }

  private admin(actor: Actor) {
    if (actor.role !== 'admin') throw new ForbiddenException('Admin account required');
  }
}
