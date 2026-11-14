import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { SMS_PROVIDER, type SmsProvider, type SendOutcome } from './sms.provider';
import { SmsService } from './sms.service';

const maxAttempts = 3;

@Injectable()
export class SmsWorker {
  constructor(private readonly db: PrismaService, private readonly sms: SmsService, @Inject(SMS_PROVIDER) private readonly provider: SmsProvider) {}

  async runOnce() {
    const now = new Date();
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
    const otp = await this.db.otpCode.findUnique({ where: { otp_id: job.otpId }, select: { phone: true, is_used: true, expires_at: true } });
    if (!otp || otp.is_used || otp.expires_at.getTime() - Date.now() <= 5000) {
      await this.db.smsJob.updateMany({ where: claimWhere, data: { status: 'EXPIRED', payload: null, leaseUntil: null } });
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
}
