import { BadRequestException } from '@nestjs/common';
import { OtpService } from './otp.service';
import { OtpType } from '@prisma/client';

describe('OTP finalization', () => {
  it('rejects an already verified account after acquiring the account lock', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ user_id: 1 }]),
      user: { findUnique: jest.fn().mockResolvedValue({ user_id: 1, is_active: true, is_verified: true }) },
      otpCode: { findFirst: jest.fn() },
    };
    const prisma = { $transaction: (run: (client: typeof tx) => unknown) => run(tx) };
    const service = new OtpService(prisma as any, {} as any, {} as any);
    const finish = jest.fn();
    await expect(service.verifyOtp('0591234567', '123456', OtpType.PHONE_VERIFICATION, finish)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.otpCode.findFirst).not.toHaveBeenCalled();
    expect(finish).not.toHaveBeenCalled();
  });
});
