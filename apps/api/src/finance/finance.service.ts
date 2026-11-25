import { payoutConfig, resolveCommissionBps } from './payout-config';
import { merchantSummary, platformSummary } from './finance-reports';
import { recordNotifications } from '../notifications/record-notifications';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomerOrder, PaymentMethod, Prisma, UserRole } from '@prisma/client';
import { createHmac, randomUUID } from 'crypto';
import { PrismaService } from 'prisma/prisma.service';
import { DriverAvailabilityDto } from './finance.dto';
import { OrderUpdates } from '../infrastructure/order-updates';

type Actor = { user_id: number; role: UserRole };
type Tx = Prisma.TransactionClient;

function merchantReceiptReport(report: Prisma.JsonValue) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return null;
  const checks = Array.isArray(report.checks) ? report.checks : [];
  return {
    checkedAt: report.checkedAt, verdict: report.verdict, riskScore: report.riskScore,
    riskLevel: report.riskLevel, summaryAr: report.summaryAr,
    checks: checks.flatMap(check => check && typeof check === 'object' && !Array.isArray(check)
      ? [{ code: check.code, labelAr: check.labelAr, status: check.status }] : []),
  };
}

@Injectable()
export class FinanceService {
  constructor(private readonly db: PrismaService, private readonly config: ConfigService, private readonly updates: OrderUpdates) {}

  assertEnabled(method: PaymentMethod) {
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
    return this.db.$transaction(async tx => {
      await this.lockDriver(tx, driverId);
      const driver = await tx.user.findFirst({ where: { user_id: driverId, role: 'driver', is_active: true, is_verified: true } });
      if (!driver) throw new NotFoundException('Driver not found');
      return tx.driverProfile.upsert({
        where: { userId: driverId }, create: { userId: driverId, approved },
        update: { approved, ...(!approved ? { available: false, latitude: null, longitude: null, locationUpdatedAt: null } : {}) },
        select: { userId: true, approved: true, available: true },
      });
    });
  }

  async driverAvailability(actor: Actor) {
    if (actor.role !== 'driver') throw new ForbiddenException();
    return await this.db.driverProfile.findUnique({ where: { userId: actor.user_id }, select: { approved: true, available: true, dispatchAreaId: true } })
      ?? { approved: false, available: false, dispatchAreaId: null };
  }

  async setAvailability(actor: Actor, { available, dispatchAreaId }: DriverAvailabilityDto) {
    if (actor.role !== 'driver') throw new ForbiddenException();
    if (available === undefined && dispatchAreaId === undefined) throw new BadRequestException('Availability or dispatch area is required');
    return this.db.$transaction(async tx => {
      await this.lockDriver(tx, actor.user_id);
      const updated = await tx.driverProfile.updateMany({
        where: { userId: actor.user_id, approved: true, user: { role: 'driver', is_active: true, is_verified: true } },
        data: { available, dispatchAreaId },
      });
      if (!updated.count) throw new ForbiddenException('Driver approval required');
      return tx.driverProfile.findUniqueOrThrow({ where: { userId: actor.user_id }, select: { available: true, dispatchAreaId: true } });
    });
  }

  private async lockDriver(tx: Tx, id: number) {
    await tx.$queryRaw`SELECT user_id FROM users WHERE user_id = ${id} FOR UPDATE`;
  }

  async assertEligibleDriver(tx: Tx, id: number) {
    await this.lockDriver(tx, id);
    const [driver] = await tx.$queryRaw<{ deliveryCompanyId: number | null }[]>`
      SELECT p.deliveryCompanyId FROM driver_profiles p JOIN users u ON u.user_id = p.userId
      WHERE p.userId = ${id} AND p.approved = TRUE AND p.available = TRUE
        AND u.role = 'driver' AND u.is_active = TRUE AND u.is_verified = TRUE FOR UPDATE`;
    if (!driver) throw new ConflictException('Driver must be approved and available');
    if (await tx.customerOrder.findUnique({ where: { activeDriverId: id }, select: { id: true } })) throw new ConflictException('Driver already has an active delivery');
    return driver;
  }

  async createPayment(tx: Tx, order: CustomerOrder, amount: Prisma.Decimal, options?: { deliveryCompanyId?: number | null }) {
    const cfg = payoutConfig(this.config);
    const store = await tx.store.findUniqueOrThrow({
      where: { storeId: order.storeId },
      select: { bankTransferPhone: true, planTier: true, commissionBps: true, storeCategory: { select: { defaultCommissionBps: true } } },
    });
    const commissionBpsApplied = resolveCommissionBps(store, cfg);
    if (!Number.isInteger(commissionBpsApplied) || commissionBpsApplied < 0 || commissionBpsApplied > 10000) {
      throw new ConflictException('Invalid payout configuration');
    }
    const deliveryFee = new Prisma.Decimal(order.deliveryFee ?? 0).toDecimalPlaces(2);
    const itemsSubtotal = Prisma.Decimal.max(0, amount.minus(deliveryFee));
    const orderCommission = itemsSubtotal.times(commissionBpsApplied).div(10000).toDecimalPlaces(2);
    const resolvedCompanyId = options?.deliveryCompanyId !== undefined ? options.deliveryCompanyId : order.deliveryCompanyId;
    const company = resolvedCompanyId
      ? await tx.deliveryCompany.findUnique({ where: { id: resolvedCompanyId }, select: { feePerOrder: true } })
      : null;
    const companyFeeApplied = company ? new Prisma.Decimal(company.feePerOrder).toDecimalPlaces(2) : new Prisma.Decimal(0);
    const deliveryMargin = deliveryFee.gt(0)
      ? deliveryFee.times(cfg.deliveryCutBps).div(10000).toDecimalPlaces(2)
      : new Prisma.Decimal(0);
    const driverShare = deliveryFee.gt(0) ? deliveryFee.minus(deliveryMargin).toDecimalPlaces(2) : cfg.defaultDriverFee;
    const platformShare = orderCommission.plus(deliveryMargin).plus(companyFeeApplied).toDecimalPlaces(2);
    const storeShare = amount.minus(platformShare).minus(driverShare).toDecimalPlaces(2);
    if (storeShare.lt(0)) {
      throw new ConflictException('Order total is too small to cover platform commission and driver delivery fee');
    }
    const recipientPhone = order.paymentMethod === 'BANK_TRANSFER' ? store.bankTransferPhone || cfg.platformBankPhone : null;
    return tx.payment.create({
      data: {
        recipientPhone,
        storeCollected: Boolean(recipientPhone && recipientPhone !== cfg.platformBankPhone),
        orderId: order.id, amount, currency: order.currency, method: order.paymentMethod,
        bankCode: order.paymentMethod === 'BANK_TRANSFER' ? randomUUID() : null,
        commissionBpsApplied, deliveryFee, companyFeeApplied, driverShare, platformShare, storeShare,
      },
    });
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
    const order = await this.db.customerOrder.findFirst({
      where: {
        id,
        ...(actor.role === 'admin'
          ? {}
          : actor.role === 'store_owner'
            ? { store: { ownerId: actor.user_id }, paymentMethod: 'BANK_TRANSFER' as const }
            : { customerId: actor.user_id }),
      },
      include: {
        payment: {
          include: {
            entries: { orderBy: { id: 'asc' } },
            receipt: {
              select: {
                submittedAt: true,
                transferReference: true,
                senderPhone: true,
                verificationStatus: true,
                riskLevel: true,
                riskScore: true,
                forensicReport: true,
                reportReason: true,
                reportedAt: true,
                decision: true,
                reviewedAt: true,
                reviewNote: true,
              },
            },
          },
        },
      },
    });
    if (!order?.payment) throw new NotFoundException('Payment not found');
    const p = order.payment;
    if (actor.role === 'admin') return p;
    return {
      recipientPhone: p.recipientPhone,
      storeCollected: p.storeCollected,
      receipt: p.receipt && {
        submittedAt: p.receipt.submittedAt,
        transferReference: p.receipt.transferReference,
        senderPhone: p.receipt.senderPhone,
        verificationStatus: p.receipt.verificationStatus,
        riskLevel: p.receipt.riskLevel,
        decision: p.receipt.decision,
        reportReason: p.receipt.reportReason,
        reviewNote: p.receipt.reviewNote,
        ...(actor.role === 'store_owner' && {
          riskScore: p.receipt.riskScore,
          forensicReport: merchantReceiptReport(p.receipt.forensicReport),
          reportedAt: p.receipt.reportedAt,
          reviewedAt: p.receipt.reviewedAt,
        }),
      },
      method: p.method,
      status: p.status,
      amount: p.amount,
      currency: p.currency,
      collectedAt: p.collectedAt,
      ...(actor.role === 'store_owner' && {
        commissionBpsApplied: p.commissionBpsApplied,
        deliveryFee: p.deliveryFee,
        companyFeeApplied: p.companyFeeApplied,
        storeShare: p.storeShare,
        driverShare: p.driverShare,
        platformShare: p.platformShare,
      }),
      ...(p.method === 'BANK_TRANSFER' && p.status === 'DUE' ? {
        bankInstructions: p.recipientPhone ? undefined : this.config.get('BANK_TRANSFER_INSTRUCTIONS'),
        whatsappText: `WASLA ${p.bankCode}`,
        whatsappReceived: !!p.whatsappReceivedAt,
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
    if (!['admin', 'store_owner'].includes(actor.role)) throw new ForbiddenException();
    return this.confirmIncoming(id, 'BANK_TRANSFER', amount, currency, reference, actor.user_id, actor.role);
  }

  async confirmIncoming(id: number, method: 'BANK_TRANSFER' | 'ELECTRONIC', amount: number, currency: string, reference: string, actorId: number, role?: UserRole) {
    try {
      const result = await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM customer_orders WHERE id = ${id} FOR UPDATE`;
        const payment = await tx.payment.findUnique({
          where: { orderId: id },
          include: {
            receipt: { select: { reportReason: true, decision: true, verificationStatus: true } },
            order: { select: { storeId: true, store: { select: { ownerId: true } } } },
          },
        });
        if (!payment || payment.method !== method) throw new NotFoundException('Payment not found');
        if (method === 'BANK_TRANSFER') {
          if (role !== 'admin' && !(role === 'store_owner' && payment.storeCollected && payment.order.store.ownerId === actorId)) throw new ForbiddenException();
          if (!payment.receipt || payment.receipt.decision === 'suspend' || payment.receipt.verificationStatus === 'FRAUD_CONFIRMED' || (payment.receipt.reportReason && payment.receipt.decision !== 'dismiss')) throw new ConflictException('An undisputed receipt is required');
          if (payment.receipt.verificationStatus === 'FLAGGED_SUSPICIOUS' && payment.receipt.decision !== 'dismiss') {
            throw new ConflictException('A flagged suspicious receipt requires admin review first');
          }
        }
        if (!payment.amount.eq(amount) || payment.currency !== currency) throw new BadRequestException('Bank amount or currency does not match');
        const ref = `${method}:${reference}`;
        if (payment.bankReference === ref) return { status: payment.status, change: null };
        if (!['DUE', 'VOID'].includes(payment.status)) throw new ConflictException('Payment already processed');
        const status = payment.status === 'VOID' ? 'REFUND_REQUIRED' : 'PAID';
        await tx.payment.update({ where: { orderId: id }, data: { status, bankReference: ref, collectedAt: new Date(), collectedBy: actorId || null } });
        if (method === 'BANK_TRANSFER' && status === 'PAID') {
          await tx.bankReceipt.updateMany({ where: { orderId: id }, data: { verificationStatus: 'VERIFIED' } });
        }
        const opened = status === 'PAID'
          ? await tx.customerOrder.updateMany({
            where: { id, status: 'ACCEPTED', dispatchOpenedAt: null },
            data: { dispatchOpenedAt: new Date() },
          })
          : null;
        await this.entry(tx, id, 'COLLECTION', method === 'BANK_TRANSFER' ? (payment.storeCollected ? `store:bank:${payment.order.storeId}` : 'platform:bank') : 'provider:clearing', 'order:clearing', payment.amount, actorId);
        const order = await tx.customerOrder.findUniqueOrThrow({ where: { id }, select: { customerId: true, store: { select: { ownerId: true } }, deliveryCompany: { select: { managerId: true } } } });
        const users = [order.customerId, order.store.ownerId, status === 'PAID' ? order.deliveryCompany?.managerId : null];
        await recordNotifications(tx, users, `payment:${id}:confirmed`, `payment.${status.toLowerCase()}`, id);
        return { status, change: { users, independent: Boolean(opened?.count && !order.deliveryCompany) } };
      });
      if (result.change) this.updates.publish(result.change.users, result.change.independent);
      return { status: result.status };
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
        if (kind === 'cash_handover' && ((p.method !== 'CASH' && !p.storeCollected) || !p.collectedBy)) throw new ConflictException('No cash custody to settle');
        if (kind !== 'cash_handover' && (p.method === 'CASH' || p.storeCollected) && !p.cashHandedOverAt) throw new ConflictException('Cash handover required first');
        const previous = await tx.paymentEntry.findUnique({ where: { orderId_kind: { orderId: id, kind } } });
        if (previous?.reference === reference) return previous;
        if (previous) throw new ConflictException('Settlement already recorded');
        if (kind === 'cash_handover') {
          await tx.payment.update({ where: { orderId: id }, data: { cashHandedOverAt: new Date(), cashHandedOverBy: actor.user_id } });
          return this.entry(tx, id, kind, p.storeCollected ? 'platform:bank' : 'platform:cash', p.storeCollected ? `store:bank:${p.order.storeId}` : `cash:driver:${p.collectedBy}`, p.amount, actor.user_id, reference);
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

  async recordRefund(actor: Actor, id: number, amount: number, currency: string, reference: string) {
    this.admin(actor);
    try {
      return await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM customer_orders WHERE id = ${id} FOR UPDATE`;
        const payment = await tx.payment.findUnique({ where: { orderId: id }, include: { order: true } });
        if (!payment || payment.order.status !== 'CANCELLED') throw new ConflictException('Cancelled payment required');
        if (!payment.amount.eq(amount) || payment.currency !== currency) throw new BadRequestException('Refund amount or currency does not match');
        const collection = await tx.paymentEntry.findUnique({ where: { orderId_kind: { orderId: id, kind: 'COLLECTION' } } });
        if (!collection) throw new ConflictException('Collection has not been recorded');
        const previous = await tx.paymentEntry.findUnique({ where: { orderId_kind: { orderId: id, kind: 'REFUND' } } });
        if (previous?.reference === reference && payment.status === 'REFUNDED') return { status: payment.status };
        if (previous || payment.status !== 'REFUND_REQUIRED') throw new ConflictException('Payment is not awaiting a refund');
        await this.entry(tx, id, 'REFUND', collection.credit, collection.debit, payment.amount, actor.user_id, reference);
        await tx.payment.update({ where: { orderId: id }, data: { status: 'REFUNDED' } });
        await recordNotifications(tx, [payment.order.customerId], `payment:${id}:refunded`, 'payment.refunded', id);
        return { status: 'REFUNDED' as const };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Refund reference already used');
      }
      throw error;
    }
  }

  private entry(tx: Tx, orderId: number, kind: string, debit: string, credit: string, amount: Prisma.Decimal, actorId: number, reference?: string) {
    return tx.paymentEntry.create({ data: { orderId, kind, debit, credit, amount, actorId, reference } });
  }

  merchantSummary(actor: Actor) {
    return merchantSummary(this.db, this.config, actor);
  }

  platformSummary(actor: Actor) {
    return platformSummary(this.db, this.config, actor);
  }

  private admin(actor: Actor) {
    if (actor.role !== 'admin') throw new ForbiddenException('Admin account required');
  }
}
