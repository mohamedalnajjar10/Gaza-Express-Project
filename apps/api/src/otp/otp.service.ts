import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpType, Prisma } from '@prisma/client';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { PrismaService } from 'prisma/prisma.service';
import { AUTH_CONSTANTS } from '../auth/constants/auth.constants';
import { hashOTP } from '../common/utils/crypto.util';
import { generateOTP } from '../common/utils/otp-generator.util';
import { SmsService } from '../sms/sms.service';

type Tx = Prisma.TransactionClient;
const invalidCode = () => new BadRequestException('Invalid or expired verification code');

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly config: ConfigService,
  ) {}

  async sendSignup(phone: string, createPending: boolean): Promise<void> {
    if (!['twilio', 'fake'].includes(this.config.get('SMS_PROVIDER', 'disabled'))) {
      throw new ServiceUnavailableException('Verification is unavailable');
    }
    await this.prisma.$transaction(async tx => {
      if (createPending) {
        await tx.$executeRaw`
          INSERT INTO users (phone, full_name, password_hash, updated_at)
          VALUES (${phone}, 'Pending verification', '', CURRENT_TIMESTAMP(3))
          ON DUPLICATE KEY UPDATE user_id = user_id`;
      }
      const user = await this.lockUser(tx, phone);
      if (!user?.is_active || user.is_verified || user.role === 'admin') return;
      await this.issue(tx, phone, OtpType.PHONE_VERIFICATION, user.user_id);
    });
  }

  async sendOtp(phone: string, type: OtpType, userId?: number): Promise<number> {
    return this.prisma.$transaction(async tx => {
      const user = await this.lockUser(tx, phone);
      if (!user || (userId !== undefined && user.user_id !== userId)) {
        throw new BadRequestException('Account unavailable');
      }
      const issued = await this.issue(tx, phone, type, user.user_id);
      if (issued === undefined) throw new BadRequestException('Please wait before requesting a new code');
      return issued;
    });
  }

  resendOtp(phone: string, type: OtpType, userId?: number) {
    return this.sendOtp(phone, type, userId);
  }

  async verifyOtp<T>(
    phone: string,
    code: string,
    purpose: OtpType,
    consume: (tx: Tx, userId: number) => Promise<T>,
  ): Promise<T> {
    const result = await this.prisma.$transaction(async tx => {
      const user = await this.lockUser(tx, phone);
      if (!user?.is_active || user.is_verified || user.role === 'admin') return null;
      const otp = await tx.otpCode.findFirst({
        where: { user_id: user.user_id, phone, type: purpose, challenge: { not: null }, is_used: false, expires_at: { gt: new Date() } },
        orderBy: { otp_id: 'desc' },
      });
      if (!otp?.challenge || otp.attempts >= AUTH_CONSTANTS.MAX_OTP_ATTEMPTS) return null;
      const actual = this.digest(code, otp.challenge, phone, purpose);
      if (!/^[a-f0-9]{64}$/.test(otp.code) || !timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(otp.code, 'hex'))) {
        await tx.otpCode.update({ where: { otp_id: otp.otp_id }, data: { attempts: { increment: 1 } } });
        return null;
      }
      await tx.otpCode.update({ where: { otp_id: otp.otp_id }, data: { is_used: true } });
      return consume(tx, user.user_id);
    });
    if (result === null) throw invalidCode();
    return result;
  }

  private async lockUser(tx: Tx, phone: string) {
    const [row] = await tx.$queryRaw<{ user_id: number }[]>`SELECT user_id FROM users WHERE phone = ${phone} FOR UPDATE`;
    if (!row) return null;
    return tx.user.findUnique({
      where: { user_id: row.user_id },
      select: { user_id: true, is_active: true, is_verified: true, role: true },
    });
  }

  private async issue(tx: Tx, phone: string, type: OtpType, userId: number) {
    const now = Date.now();
    const cooldown = Number(this.config.get('OTP_RESEND_COOLDOWN_MS', 60_000));
    const recent = await tx.otpCode.findMany({
      where: { phone, type, challenge: { not: null }, created_at: { gte: new Date(now - Math.max(3_600_000, cooldown)) } },
      orderBy: { created_at: 'desc' },
      take: 5,
      select: { created_at: true },
    });
    if (recent.length === 5 || (recent[0] && now - recent[0].created_at.getTime() < cooldown)) return;
    const code = generateOTP(AUTH_CONSTANTS.OTP_LENGTH);
    const challenge = randomUUID();
    const expiresAt = new Date(now + AUTH_CONSTANTS.OTP_EXPIRY_SECONDS * 1000);
    await tx.otpCode.updateMany({ where: { phone, type, is_used: false }, data: { is_used: true } });
    const otp = await tx.otpCode.create({
      data: { phone, type, user_id: userId, challenge, code: this.digest(code, challenge, phone, type), expires_at: expiresAt },
    });
    await this.sms.enqueueVerification(tx, otp.otp_id, code, expiresAt);
    return otp.otp_id;
  }

  private digest(code: string, challenge: string, phone: string, purpose: OtpType) {
    const key = this.config.get<string>('OTP_SIGNING_SECRET') ??
      (this.config.get('NODE_ENV') !== 'production' ? this.config.get<string>('JWT_REFRESH_SECRET') : undefined);
    if (!key) throw new ServiceUnavailableException('Verification is unavailable');
    return hashOTP(code, key, challenge, phone, purpose);
  }
}
