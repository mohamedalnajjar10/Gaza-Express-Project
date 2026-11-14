import { BadRequestException } from '@nestjs/common';
import { OtpService } from './otp.service';
import { OtpType } from '@prisma/client';
describe('OTP compare-and-set', () => {
  it('rejects a request that loses the consume race', async () => {
    const prisma = { otpCode: { findFirst: jest.fn().mockResolvedValue({ otp_id: 1 }), updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    const service = new OtpService(prisma as any, {} as any, {} as any);
    await expect(service.verifyOtp('0591234567', '123456', OtpType.PHONE_VERIFICATION)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.otpCode.updateMany).toHaveBeenCalledWith({ where: { otp_id: 1, is_used: false, expires_at: { gt: expect.any(Date) } }, data: { is_used: true } });
  });
});
