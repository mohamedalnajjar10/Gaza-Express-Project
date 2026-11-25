import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpType } from '@prisma/client';
import { hashOTP } from '../common/utils/crypto.util';
import { OtpService } from './otp.service';

const phone = '0591234567';
const type = OtpType.PHONE_VERIFICATION;
const code = '123456';
const challenge = 'fixture';
const secret = 'test-only-independent-key';

describe('OtpService', () => {
  const tx = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    user: { findUnique: jest.fn(), update: jest.fn() },
    otpCode: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  };
  const sms = { enqueueVerification: jest.fn() };
  const db = { $transaction: jest.fn(async callback => callback(tx)) };
  const service = new OtpService(db as any, sms as any, new ConfigService({ OTP_SIGNING_SECRET: secret, SMS_PROVIDER: 'fake' }));

  beforeEach(() => {
    jest.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([{ user_id: 1 }]);
    tx.user.findUnique.mockResolvedValue({ user_id: 1, is_active: true, is_verified: false, role: 'customer', pendingSignupRole: null });
    tx.otpCode.findMany.mockResolvedValue([]);
    tx.otpCode.create.mockResolvedValue({ otp_id: 1 });
    tx.otpCode.findFirst.mockResolvedValue({ otp_id: 1, attempts: 0, challenge, code: hashOTP(code, secret, challenge, phone, type) });
  });

  it('enqueues only the plaintext in the encrypted outbox path and stores its bound digest', async () => {
    await expect(service.sendOtp(phone, type, 1)).resolves.toBe(1);
    const { code: digest, challenge: nonce } = tx.otpCode.create.mock.calls[0][0].data;
    const emitted = sms.enqueueVerification.mock.calls[0][2];
    expect(digest).toBe(hashOTP(emitted, secret, nonce, phone, type));
    expect(digest).not.toBe(hashOTP(emitted, secret, 'different', phone, type));
  });

  it('enforces delivery cooldown and never overwrites an outstanding code during cooldown', async () => {
    tx.otpCode.findMany.mockResolvedValue([{ created_at: new Date() }]);
    await expect(service.resendOtp(phone, type, 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.otpCode.updateMany).not.toHaveBeenCalled();
    expect(sms.enqueueVerification).not.toHaveBeenCalled();
  });

  it('consumes the challenge and updates credentials inside the same transaction', async () => {
    tx.user.findUnique.mockResolvedValueOnce({ user_id: 1, is_active: true, is_verified: false, pendingSignupRole: 'driver' });
    const finish = jest.fn().mockResolvedValue('session');
    await expect(service.verifyOtp(phone, code, type, finish)).resolves.toBe('session');
    expect(finish).toHaveBeenCalledWith(tx, 1, 'driver');
    expect(tx.otpCode.update).toHaveBeenCalledWith({ where: { otp_id: 1 }, data: { is_used: true } });
  });

  it('keeps the role of an existing challenge during the resend cooldown', async () => {
    await service.sendSignup(phone, true, 'store_owner');
    expect(tx.user.update).toHaveBeenCalledWith({ where: { user_id: 1 }, data: { pendingSignupRole: 'store_owner' } });
    tx.otpCode.findMany.mockResolvedValue([{ created_at: new Date() }]);
    await service.sendSignup(phone, true, 'driver');
    expect(tx.user.update).toHaveBeenCalledTimes(1);
  });

  it('commits a failed attempt without executing the successful verification callback', async () => {
    const finish = jest.fn();
    await expect(service.verifyOtp(phone, '000000', type, finish)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.otpCode.update).toHaveBeenCalledWith({ where: { otp_id: 1 }, data: { attempts: { increment: 1 } } });
    expect(finish).not.toHaveBeenCalled();
  });

  it('rejects exhausted challenges even with the correct code', async () => {
    tx.otpCode.findFirst.mockResolvedValueOnce({ otp_id: 1, attempts: 5, challenge, code: hashOTP(code, secret, challenge, phone, type) });
    const finish = jest.fn();
    await expect(service.verifyOtp(phone, code, type, finish)).rejects.toBeInstanceOf(BadRequestException);
    expect(finish).not.toHaveBeenCalled();
  });

  it('allows PASSWORD_RESET and LOGIN OTP verification only for verified non-admin users', async () => {
    tx.user.findUnique.mockResolvedValueOnce({ user_id: 1, is_active: true, is_verified: true, role: 'customer', pendingSignupRole: null });
    tx.otpCode.findFirst.mockResolvedValueOnce({
      otp_id: 2,
      attempts: 0,
      challenge,
      code: hashOTP(code, secret, challenge, phone, OtpType.PASSWORD_RESET),
    });
    const finish = jest.fn().mockResolvedValue('reset-ok');
    await expect(service.verifyOtp(phone, code, OtpType.PASSWORD_RESET, finish)).resolves.toBe('reset-ok');
    expect(finish).toHaveBeenCalledWith(tx, 1, null);
  });
});
