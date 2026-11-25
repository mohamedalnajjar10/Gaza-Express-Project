import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { OrderUpdates } from '../infrastructure/order-updates';
import { recordNotifications } from '../notifications/record-notifications';
import { AdminReceiptQueueDto, UploadReceiptDto } from './finance.dto';
import { ReceiptVerificationService } from './receipt-verification.service';

type Actor = { user_id: number; role: UserRole };

@Injectable()
export class BankReceiptsService {
  constructor(
    private readonly db: PrismaService,
    private readonly verifier: ReceiptVerificationService,
    private readonly updates: OrderUpdates,
  ) {}

  private async payment(tx: Prisma.TransactionClient, orderId: number) {
    await tx.$queryRaw`SELECT id FROM customer_orders WHERE id = ${orderId} FOR UPDATE`;
    const payment = await tx.payment.findFirst({
      where: { orderId, method: 'BANK_TRANSFER' },
      include: { order: { select: { customerId: true, store: { select: { ownerId: true } } } } },
    });
    if (!payment) throw new NotFoundException();
    return payment;
  }

  async upload(actor: Actor, orderId: number, bytes?: Buffer, dto?: UploadReceiptDto) {
    if (actor.role !== 'customer') throw new ForbiddenException();
    if (!bytes?.length) throw new BadRequestException('أرفق صورة التحويل');
    const preflight = await this.db.payment.findFirst({
      where: { orderId, method: 'BANK_TRANSFER', order: { customerId: actor.user_id } },
      select: { amount: true },
    });
    if (!preflight) throw new NotFoundException();
    if (dto?.claimedAmount !== undefined && !preflight.amount.eq(dto.claimedAmount)) {
      throw new BadRequestException('المبلغ المحوّل المدخل لا يطابق إجمالي الطلب المطلوب');
    }

    const analyzed = await this.verifier.analyze(bytes);
    const similarMatches = await this.verifier.findSimilarReceipts(this.db, orderId, analyzed.perceptualHash);

    const outcome = await this.db.$transaction(async tx => {
      const p = await this.payment(tx, orderId);
      if (p.order.customerId !== actor.user_id) throw new NotFoundException();
      if (!['DUE', 'VOID'].includes(p.status) || await tx.bankReceipt.count({ where: { orderId } })) {
        throw new ConflictException('يوجد إيصال أو انتهى الدفع');
      }
      if (dto?.claimedAmount !== undefined && !p.amount.eq(dto.claimedAmount)) {
        throw new BadRequestException('المبلغ المحوّل المدخل لا يطابق إجمالي الطلب المطلوب');
      }

      const assessment = await this.verifier.assess(tx, orderId, analyzed, {
        transferReference: dto?.transferReference,
        similarMatches,
      });

      await tx.bankReceipt.create({
        data: {
          orderId,
          image: new Uint8Array(analyzed.webpBuffer),
          rawSha256: analyzed.rawSha256,
          perceptualHash: analyzed.perceptualHash,
          imageWidth: analyzed.width,
          imageHeight: analyzed.height,
          originalFormat: analyzed.originalFormat,
          transferReference: dto?.transferReference ?? null,
          senderPhone: dto?.senderPhone ?? null,
          verificationStatus: assessment.verificationStatus,
          riskLevel: assessment.riskLevel,
          riskScore: assessment.riskScore,
          forensicReport: assessment.forensicReport as unknown as Prisma.InputJsonValue,
        },
        select: { orderId: true },
      });

      const admins = await tx.user.findMany({ where: { role: 'admin', is_active: true }, select: { user_id: true } });
      const recipients = [p.order.store.ownerId, ...admins.map(a => a.user_id)];
      const kind = assessment.verificationStatus === 'FLAGGED_SUSPICIOUS' ? 'payment.receipt_suspicious' : 'payment.receipt';
      await recordNotifications(tx, recipients, `receipt:${orderId}`, kind, orderId);
      return {
        notify: recipients,
        result: {
          submitted: true,
          verificationStatus: assessment.verificationStatus,
          riskLevel: assessment.riskLevel,
        },
      };
    });

    this.updates.publish(outcome.notify);
    return outcome.result;
  }

  async read(actor: Actor, orderId: number) {
    const access = actor.role === 'admin' ? {} : actor.role === 'store_owner' ? { store: { ownerId: actor.user_id } } : { customerId: actor.user_id };
    const receipt = await this.db.bankReceipt.findFirst({ where: { orderId, payment: { order: access } }, select: { image: true } });
    if (!receipt) throw new NotFoundException();
    return Buffer.from(receipt.image);
  }

  async report(actor: Actor, orderId: number, reason: string) {
    if (actor.role !== 'store_owner' && actor.role !== 'admin') throw new ForbiddenException();
    const outcome = await this.db.$transaction(async tx => {
      const p = await this.payment(tx, orderId);
      if (actor.role === 'store_owner' && p.order.store.ownerId !== actor.user_id) throw new NotFoundException();
      if (!['DUE', 'VOID'].includes(p.status)) throw new ConflictException();
      const result = await tx.bankReceipt.updateMany({
        where: { orderId, reportReason: null },
        data: {
          reportReason: reason.trim(),
          reportedBy: actor.user_id,
          reportedAt: new Date(),
          verificationStatus: 'REPORTED_FRAUD',
        },
      });
      if (!result.count) throw new ConflictException();
      const admins = await tx.user.findMany({ where: { role: 'admin', is_active: true }, select: { user_id: true } });
      const adminIds = admins.map(a => a.user_id);
      await recordNotifications(tx, adminIds, `receipt-report:${orderId}`, 'payment.fraud_report', orderId);
      return { notify: [p.order.customerId, p.order.store.ownerId, ...adminIds] };
    });
    this.updates.publish(outcome.notify);
    return { reported: true };
  }

  async review(actor: Actor, orderId: number, decision: 'dismiss' | 'suspend', note?: string) {
    if (actor.role !== 'admin') throw new ForbiddenException();
    const outcome = await this.db.$transaction(async tx => {
      const p = await this.payment(tx, orderId);
      const result = await tx.bankReceipt.updateMany({
        where: {
          orderId,
          decision: null,
          OR: [{ reportReason: { not: null } }, { verificationStatus: 'FLAGGED_SUSPICIOUS' }],
        },
        data: {
          decision,
          reviewedBy: actor.user_id,
          reviewedAt: new Date(),
          reviewNote: note?.trim() || null,
          verificationStatus: decision === 'suspend' ? 'FRAUD_CONFIRMED' : 'DISMISSED',
        },
      });
      if (!result.count) throw new ConflictException();
      if (decision === 'suspend') {
        await tx.user.update({
          where: { user_id: p.order.customerId, role: 'customer' },
          data: {
            is_active: false,
            sessionVersion: { increment: 1 },
            refresh_tokens: { updateMany: { where: { revoked_at: null }, data: { revoked_at: new Date() } } },
          },
        });
      }
      await recordNotifications(
        tx,
        [p.order.store.ownerId],
        `receipt-review:${orderId}`,
        decision === 'suspend' ? 'payment.fraud_suspended' : 'payment.fraud_dismissed',
        orderId,
      );
      return { notify: [p.order.store.ownerId, p.order.customerId] };
    });
    this.updates.publish(outcome.notify);
    return { decision };
  }

  async adminQueue(actor: Actor, query: AdminReceiptQueueDto) {
    if (actor.role !== 'admin') throw new ForbiddenException();
    const status = query.status ?? 'reported';
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.BankReceiptWhereInput =
      status === 'reported'
        ? { reportReason: { not: null }, decision: null }
        : status === 'suspicious'
          ? { OR: [{ riskLevel: 'HIGH' }, { verificationStatus: 'FLAGGED_SUSPICIOUS' }] }
          : status === 'pending'
            ? { payment: { status: { in: ['DUE', 'VOID'] } }, reportReason: null }
            : {};

    const [rows, total] = await Promise.all([
      this.db.bankReceipt.findMany({
        where,
        orderBy: [{ submittedAt: 'desc' }, { orderId: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          orderId: true,
          submittedAt: true,
          verificationStatus: true,
          riskLevel: true,
          riskScore: true,
          forensicReport: true,
          transferReference: true,
          senderPhone: true,
          reportReason: true,
          reportedAt: true,
          decision: true,
          reviewedAt: true,
          reviewNote: true,
          payment: {
            select: {
              amount: true,
              currency: true,
              status: true,
              recipientPhone: true,
              storeCollected: true,
              order: {
                select: {
                  status: true,
                  storeId: true,
                  storeName: true,
                  store: { select: { storeNameAr: true, ownerId: true } },
                  customer: { select: { user_id: true, full_name: true, full_name_ar: true, phone: true, is_active: true } },
                },
              },
            },
          },
        },
      }),
      this.db.bankReceipt.count({ where }),
    ]);

    return {
      items: rows,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
