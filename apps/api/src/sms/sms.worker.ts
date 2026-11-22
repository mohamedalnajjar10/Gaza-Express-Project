import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { SMS_PROVIDER, type SmsProvider, type SendOutcome } from './sms.provider';
import { SmsService } from './sms.service';

const maxAttempts = 3;

@Injectable()
export class SmsWorker {
  private nextReconcileAt = 0;

  constructor(private readonly db: PrismaService, private readonly sms: SmsService, @Inject(SMS_PROVIDER) private readonly provider: SmsProvider) {}

  async runOnce() {
    const now = new Date();
    if (this.provider.deliveryStatus && now.getTime() >= this.nextReconcileAt) {
      this.nextReconcileAt = now.getTime() + 5000;
      await this.reconcileOne(now);
    }
    await this.db.smsJob.updateMany({ where: { status: 'PENDING', expiresAt: { lte: now } }, data: { status: 'EXPIRED', payload: null } });
    await this.db.smsJob.updateMany({ where: { status: 'PROCESSING', leaseUntil: { lte: now } }, data: { status: 'UNKNOWN', payload: null, leaseUntil: null, errorCode: 'lease_expired' } });
    const job = await this.db.smsJob.findFirst({ where: { status: 'PENDING', availableAt: { lte: now }, expiresAt: { gt: now } }, orderBy: [{ availableAt: 'asc' }, { id: 'asc' }] });
    if (!job) return false;
    const leaseUntil = new Date(Date.now() + 30_000);
    const claim = await this.db.smsJob.updateMany({
      where: { id: job.id, status: 'PENDING', attempts: job.attempts, availableAt: { lte: now }, expiresAt: { gt: now } },
      data: { status: 'PROCESSING', attempts: { increment: 1 }, leaseUntil },
    });
    if (!claim.count) return true;
    const claimWhere = { id: job.id, status: 'PROCESSING' as const, leaseUntil };
    const otp = await this.db.otpCode.findUnique({ where: { otp_id: job.otpId }, select: { phone: true, challenge: true, is_used: true, expires_at: true } });
    if (!otp?.challenge || otp.is_used || otp.expires_at.getTime() - Date.now() <= 5000) {
      await this.db.smsJob.updateMany({
        where: claimWhere,
        data: { status: 'EXPIRED', payload: null, leaseUntil: null, ...(otp && !otp.challenge && { errorCode: 'legacy_challenge' }) },
      });
      return true;
    }
    let code: string;
    try { code = this.sms.decrypt(job); }
    catch {
      await this.db.smsJob.updateMany({ where: claimWhere, data: { status: 'FAILED', payload: null, leaseUntil: null, errorCode: 'invalid_payload' } });
      return true;
    }
    let outcome: SendOutcome;
    try { outcome = await this.provider.send(otp.phone, `Wasla verification code: ${code}. Do not share it.`, otp.expires_at); }
    catch { outcome = { status: 'unknown', code: 'transport_uncertain' }; }
    if (outcome.status === 'retry') {
      const next = new Date(Date.now() + 1000 * 2 ** job.attempts + Math.floor(Math.random() * 500));
      if (job.attempts + 1 < maxAttempts && next.getTime() + 5000 < job.expiresAt.getTime()) {
        await this.db.smsJob.updateMany({ where: claimWhere, data: { status: 'PENDING', availableAt: next, leaseUntil: null, errorCode: outcome.code } });
        return true;
      }
    }
    await this.db.smsJob.updateMany({ where: claimWhere, data: {
      status: outcome.status === 'accepted' ? 'ACCEPTED' : outcome.status === 'unknown' ? 'UNKNOWN' : 'FAILED',
      providerId: outcome.status === 'accepted' ? outcome.providerId : null,
      errorCode: outcome.status === 'accepted' ? null : outcome.code,
      payload: null, leaseUntil: null,
    } });
    return true;
  }

  private async reconcileOne(now: Date) {
    const where = { status: 'ACCEPTED' as const, updatedAt: { lt: new Date(now.getTime() - 60_000) } };
    const job = await this.db.smsJob.findFirst({ where, orderBy: { updatedAt: 'asc' } });
    if (!job?.providerId || !this.provider.deliveryStatus) return;
    const claim = await this.db.smsJob.updateMany({
      where: { id: job.id, status: 'ACCEPTED', updatedAt: job.updatedAt },
      data: { updatedAt: now },
    });
    if (!claim.count) return;
    let status: 'delivered' | 'failed' | 'pending' = 'pending';
    try { status = await this.provider.deliveryStatus(job.providerId); }
    catch { /* Retry status lookup next cycle. Sending remains at most once after acceptance. */ }
    const expired = now.getTime() - job.createdAt.getTime() > 86_400_000;
    if (status === 'pending' && !expired) return;
    await this.db.smsJob.updateMany({
      where: { id: job.id, status: 'ACCEPTED', updatedAt: now },
      data: {
        status: status === 'delivered' ? 'DELIVERED' : status === 'failed' ? 'FAILED' : 'UNKNOWN',
        errorCode: status === 'failed' ? 'provider_undelivered' : status === 'pending' ? 'delivery_unconfirmed' : null,
      },
    });
  }
}
