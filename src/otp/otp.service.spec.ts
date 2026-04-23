import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { OtpService } from './otp.service';
import { SmsService } from '../sms/sms.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { OtpType } from '@prisma/client';
import * as otpGenerator from '../common/utils/otp-generator.util';
import * as cryptoUtil from '../common/utils/crypto.util';
import { AUTH_CONSTANTS } from '../auth/constants/auth.constants';

// Fixtures
const MOCK_PHONE = '0592149436';
const MOCK_CODE = '123456';
const MOCK_HASHED_CODE = 'a'.repeat(64);
const MOCK_OTP_ID = 1;

const mockOtpRecord = {
  otp_id: MOCK_OTP_ID,
  phone: MOCK_PHONE,
  code: MOCK_HASHED_CODE,
  type: OtpType.PHONE_VERIFICATION,
  is_used: false,
  expires_at: new Date(Date.now() + 5 * 60 * 1000),
  created_at: new Date(),
  user_id: 1,
  user: null,
};

// Mocks
const mockPrismaService = {
  otpCode: {
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findFirst: jest.fn(),
  },
};

const mockSmsService = {
  sendVerificationCode: jest.fn(),
  sendMessage: jest.fn(),
};

const mockConfigService = {
  get: jest.fn(),
};

// OtpService Test Suite
describe('OtpService', () => {
  let otpService: OtpService;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SmsService, useValue: mockSmsService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    otpService = module.get<OtpService>(OtpService);
    jest.clearAllMocks();

    jest.spyOn(otpGenerator, 'generateOTP').mockReturnValue(MOCK_CODE);
    jest.spyOn(cryptoUtil, 'hashOTP').mockReturnValue(MOCK_HASHED_CODE);
    mockConfigService.get.mockImplementation(
      (key: string, defaultVal?: any) => defaultVal,
    );
  });

  // sendOtp
  describe('sendOtp()', () => {
    beforeEach(() => {
      mockPrismaService.otpCode.updateMany.mockResolvedValue({ count: 0 });
      mockPrismaService.otpCode.create.mockResolvedValue(mockOtpRecord);
      mockSmsService.sendVerificationCode.mockResolvedValue(undefined);
    });

    it('[SUCCESS] should invalidate old OTPs before creating new one', async () => {
      await otpService.sendOtp(MOCK_PHONE, OtpType.PHONE_VERIFICATION, 1);

      expect(mockPrismaService.otpCode.updateMany).toHaveBeenCalledWith({
        where: {
          phone: MOCK_PHONE,
          type: OtpType.PHONE_VERIFICATION,
          is_used: false,
        },
        data: { is_used: true },
      });
    });

    it('[SUCCESS] should create OTP with hashed code', async () => {
      await otpService.sendOtp(MOCK_PHONE, OtpType.PHONE_VERIFICATION, 1);

      const createArg = mockPrismaService.otpCode.create.mock.calls[0][0];
      expect(createArg.data.code).toBe(MOCK_HASHED_CODE);
      expect(createArg.data.code).not.toBe(MOCK_CODE);
    });

    it('[SUCCESS] should return otp_id on success', async () => {
      const result = await otpService.sendOtp(
        MOCK_PHONE,
        OtpType.PHONE_VERIFICATION,
        1,
      );

      expect(result).toBe(MOCK_OTP_ID);
    });

    it('[SUCCESS] should send plain code via SMS not hashed', async () => {
      await otpService.sendOtp(MOCK_PHONE, OtpType.PHONE_VERIFICATION, 1);

      expect(mockSmsService.sendVerificationCode).toHaveBeenCalledWith(
        MOCK_PHONE,
        MOCK_CODE,
      );
    });

    it('[SUCCESS] should set expiry correctly based on AUTH_CONSTANTS', async () => {
      const before = Date.now();
      await otpService.sendOtp(MOCK_PHONE, OtpType.PHONE_VERIFICATION, 1);
      const after = Date.now();

      const createArg = mockPrismaService.otpCode.create.mock.calls[0][0];
      const expiresAt = createArg.data.expires_at.getTime();
      const expectedExpiry = AUTH_CONSTANTS.OTP_EXPIRY_SECONDS * 1000;

      expect(expiresAt).toBeGreaterThanOrEqual(before + expectedExpiry);
      expect(expiresAt).toBeLessThanOrEqual(after + expectedExpiry);
    });

    it('[SUCCESS] should include user_id when provided', async () => {
      await otpService.sendOtp(MOCK_PHONE, OtpType.PHONE_VERIFICATION, 5);

      const createArg = mockPrismaService.otpCode.create.mock.calls[0][0];
      expect(createArg.data.user_id).toBe(5);
    });

    it('[SUCCESS] should NOT include user_id when not provided', async () => {
      await otpService.sendOtp(MOCK_PHONE, OtpType.PHONE_VERIFICATION);

      const createArg = mockPrismaService.otpCode.create.mock.calls[0][0];
      expect(createArg.data).not.toHaveProperty('user_id');
    });

    it('[SUCCESS] should set is_used to false on creation', async () => {
      await otpService.sendOtp(MOCK_PHONE, OtpType.PHONE_VERIFICATION, 1);

      const createArg = mockPrismaService.otpCode.create.mock.calls[0][0];
      expect(createArg.data.is_used).toBe(false);
    });

    it('[SUCCESS] should work with different OTP types', async () => {
      await otpService.sendOtp(MOCK_PHONE, OtpType.PASSWORD_RESET, 1);

      const createArg = mockPrismaService.otpCode.create.mock.calls[0][0];
      expect(createArg.data.type).toBe(OtpType.PASSWORD_RESET);
    });

    it('[ERROR] should throw InternalServerErrorException if SMS fails', async () => {
      mockSmsService.sendVerificationCode.mockRejectedValue(
        new Error('SMS provider down'),
      );

      await expect(
        otpService.sendOtp(MOCK_PHONE, OtpType.PHONE_VERIFICATION, 1),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('[ERROR] should throw InternalServerErrorException if DB create fails', async () => {
      mockPrismaService.otpCode.create.mockRejectedValue(
        new Error('DB connection error'),
      );

      await expect(
        otpService.sendOtp(MOCK_PHONE, OtpType.PHONE_VERIFICATION, 1),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('[ERROR] should rethrow BadRequestException as-is', async () => {
      mockPrismaService.otpCode.updateMany.mockRejectedValue(
        new BadRequestException('Validation error'),
      );

      await expect(
        otpService.sendOtp(MOCK_PHONE, OtpType.PHONE_VERIFICATION, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('[SECURITY] should call generateOTP with correct length', async () => {
      await otpService.sendOtp(MOCK_PHONE, OtpType.PHONE_VERIFICATION, 1);

      expect(otpGenerator.generateOTP).toHaveBeenCalledWith(
        AUTH_CONSTANTS.OTP_LENGTH,
      );
    });

    it('[SECURITY] should call hashOTP with the generated code', async () => {
      await otpService.sendOtp(MOCK_PHONE, OtpType.PHONE_VERIFICATION, 1);

      expect(cryptoUtil.hashOTP).toHaveBeenCalledWith(MOCK_CODE);
    });
  });

  // verifyOtp
  describe('verifyOtp()', () => {
    beforeEach(() => {
      mockPrismaService.otpCode.findFirst.mockResolvedValue(mockOtpRecord);
      mockPrismaService.otpCode.update.mockResolvedValue({
        ...mockOtpRecord,
        is_used: true,
      });
    });

    it('[SUCCESS] should return OTP record on valid verification', async () => {
      const result = await otpService.verifyOtp(
        MOCK_PHONE,
        MOCK_CODE,
        OtpType.PHONE_VERIFICATION,
      );

      expect(result).toEqual(mockOtpRecord);
    });

    it('[SUCCESS] should mark OTP as used after verification', async () => {
      await otpService.verifyOtp(
        MOCK_PHONE,
        MOCK_CODE,
        OtpType.PHONE_VERIFICATION,
      );

      expect(mockPrismaService.otpCode.update).toHaveBeenCalledWith({
        where: { otp_id: MOCK_OTP_ID },
        data: { is_used: true },
      });
    });

    it('[SECURITY] should hash the input code before querying DB', async () => {
      await otpService.verifyOtp(
        MOCK_PHONE,
        MOCK_CODE,
        OtpType.PHONE_VERIFICATION,
      );

      expect(cryptoUtil.hashOTP).toHaveBeenCalledWith(MOCK_CODE);
      const queryArg = mockPrismaService.otpCode.findFirst.mock.calls[0][0];
      expect(queryArg.where.code).toBe(MOCK_HASHED_CODE);
    });

    it('[QUERY] should filter by phone, type, is_used=false, expires_at>now', async () => {
      await otpService.verifyOtp(
        MOCK_PHONE,
        MOCK_CODE,
        OtpType.PHONE_VERIFICATION,
      );

      const queryArg = mockPrismaService.otpCode.findFirst.mock.calls[0][0];
      expect(queryArg.where.phone).toBe(MOCK_PHONE);
      expect(queryArg.where.type).toBe(OtpType.PHONE_VERIFICATION);
      expect(queryArg.where.is_used).toBe(false);
      expect(queryArg.where.expires_at).toHaveProperty('gt');
    });

    it('[QUERY] should include user relation in query', async () => {
      await otpService.verifyOtp(
        MOCK_PHONE,
        MOCK_CODE,
        OtpType.PHONE_VERIFICATION,
      );

      const queryArg = mockPrismaService.otpCode.findFirst.mock.calls[0][0];
      expect(queryArg.include).toHaveProperty('user', true);
    });

    it('[ERROR] should throw BadRequestException when OTP not found', async () => {
      mockPrismaService.otpCode.findFirst.mockResolvedValue(null);

      await expect(
        otpService.verifyOtp(MOCK_PHONE, '000000', OtpType.PHONE_VERIFICATION),
      ).rejects.toThrow(BadRequestException);
    });

    it('[ERROR] should throw BadRequestException for expired OTP (returns null)', async () => {
      mockPrismaService.otpCode.findFirst.mockResolvedValue(null);

      await expect(
        otpService.verifyOtp(MOCK_PHONE, MOCK_CODE, OtpType.PHONE_VERIFICATION),
      ).rejects.toThrow(BadRequestException);
    });

    it('[ERROR] should throw BadRequestException for already used OTP (returns null)', async () => {
      mockPrismaService.otpCode.findFirst.mockResolvedValue(null);

      await expect(
        otpService.verifyOtp(MOCK_PHONE, MOCK_CODE, OtpType.PHONE_VERIFICATION),
      ).rejects.toThrow(BadRequestException);
    });

    it('[ERROR] should throw InternalServerErrorException on unexpected DB error', async () => {
      mockPrismaService.otpCode.findFirst.mockRejectedValue(
        new Error('DB error'),
      );

      await expect(
        otpService.verifyOtp(MOCK_PHONE, MOCK_CODE, OtpType.PHONE_VERIFICATION),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('[ERROR] should rethrow BadRequestException without wrapping', async () => {
      mockPrismaService.otpCode.findFirst.mockResolvedValue(null);

      try {
        await otpService.verifyOtp(
          MOCK_PHONE,
          MOCK_CODE,
          OtpType.PHONE_VERIFICATION,
        );
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error).not.toBeInstanceOf(InternalServerErrorException);
      }
    });

    it('[SUCCESS] should not call update if OTP not found', async () => {
      mockPrismaService.otpCode.findFirst.mockResolvedValue(null);

      try {
        await otpService.verifyOtp(
          MOCK_PHONE,
          MOCK_CODE,
          OtpType.PHONE_VERIFICATION,
        );
      } catch {
        expect(mockPrismaService.otpCode.update).not.toHaveBeenCalled();
      }
    });
  });

  // resendOtp
  describe('resendOtp()', () => {
    beforeEach(() => {
      mockPrismaService.otpCode.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.otpCode.create.mockResolvedValue(mockOtpRecord);
      mockSmsService.sendVerificationCode.mockResolvedValue(undefined);
    });

    it('[SUCCESS] should send OTP immediately if no previous OTP exists', async () => {
      mockPrismaService.otpCode.findFirst.mockResolvedValue(null);

      const result = await otpService.resendOtp(
        MOCK_PHONE,
        OtpType.PHONE_VERIFICATION,
      );

      expect(result).toBe(MOCK_OTP_ID);
      expect(mockSmsService.sendVerificationCode).toHaveBeenCalled();
    });

    it('[SUCCESS] should resend OTP if cooldown period has passed', async () => {
      const cooldownMs = AUTH_CONSTANTS.OTP_RESEND_LOCK_SECONDS * 1000;
      const oldOtp = {
        ...mockOtpRecord,
        created_at: new Date(Date.now() - cooldownMs - 5000),
      };
      mockPrismaService.otpCode.findFirst.mockResolvedValue(oldOtp);

      const result = await otpService.resendOtp(
        MOCK_PHONE,
        OtpType.PHONE_VERIFICATION,
        1,
      );

      expect(result).toBe(MOCK_OTP_ID);
    });

    it('[ERROR] should throw BadRequestException if within cooldown period', async () => {
      const recentOtp = {
        ...mockOtpRecord,
        created_at: new Date(Date.now() - 10 * 1000),
      };
      mockPrismaService.otpCode.findFirst.mockResolvedValueOnce(recentOtp);

      await expect(
        otpService.resendOtp(MOCK_PHONE, OtpType.PHONE_VERIFICATION),
      ).rejects.toThrow(BadRequestException);
    });

    it('[ERROR] should include remaining seconds in error message', async () => {
      const elapsedSeconds = 20;
      const recentOtp = {
        ...mockOtpRecord,
        created_at: new Date(Date.now() - elapsedSeconds * 1000),
      };
      mockPrismaService.otpCode.findFirst.mockResolvedValueOnce(recentOtp);

      try {
        await otpService.resendOtp(MOCK_PHONE, OtpType.PHONE_VERIFICATION);
      } catch (error) {
        expect(error.message).toMatch(/\d+/);
        expect(error.message.toLowerCase()).toContain('second');
      }
    });

    it('[BOUNDARY] should throw at exactly 1 second before cooldown ends', async () => {
      const cooldownMs = AUTH_CONSTANTS.OTP_RESEND_LOCK_SECONDS * 1000;
      const recentOtp = {
        ...mockOtpRecord,
        created_at: new Date(Date.now() - (cooldownMs - 1000)),
      };
      mockPrismaService.otpCode.findFirst.mockResolvedValueOnce(recentOtp);

      await expect(
        otpService.resendOtp(MOCK_PHONE, OtpType.PHONE_VERIFICATION),
      ).rejects.toThrow(BadRequestException);
    });

    it('[BOUNDARY] should succeed 1 second after cooldown ends', async () => {
      const cooldownMs = AUTH_CONSTANTS.OTP_RESEND_LOCK_SECONDS * 1000;
      const oldOtp = {
        ...mockOtpRecord,
        created_at: new Date(Date.now() - (cooldownMs + 1000)),
      };
      mockPrismaService.otpCode.findFirst.mockResolvedValueOnce(oldOtp);

      await expect(
        otpService.resendOtp(MOCK_PHONE, OtpType.PHONE_VERIFICATION),
      ).resolves.toBe(MOCK_OTP_ID);
    });

    it('[SUCCESS] should use configService cooldown over AUTH_CONSTANTS default', async () => {
      const customCooldownMs = 30 * 1000; // 30 seconds
      mockConfigService.get.mockReturnValue(customCooldownMs);

      const recentOtp = {
        ...mockOtpRecord,
        created_at: new Date(Date.now() - 10 * 1000),
      };
      mockPrismaService.otpCode.findFirst.mockResolvedValueOnce(recentOtp);

      await expect(
        otpService.resendOtp(MOCK_PHONE, OtpType.PHONE_VERIFICATION),
      ).rejects.toThrow(BadRequestException);

      expect(mockConfigService.get).toHaveBeenCalledWith(
        'OTP_RESEND_COOLDOWN_MS',
        expect.any(Number),
      );
    });

    it('[SUCCESS] should call findFirst with correct filters', async () => {
      mockPrismaService.otpCode.findFirst.mockResolvedValue(null);

      await otpService.resendOtp(MOCK_PHONE, OtpType.PHONE_VERIFICATION, 1);

      expect(mockPrismaService.otpCode.findFirst).toHaveBeenCalledWith({
        where: { phone: MOCK_PHONE, type: OtpType.PHONE_VERIFICATION },
        orderBy: { created_at: 'desc' },
      });
    });

    it('[SUCCESS] should call sendOtp with userId when provided', async () => {
      mockPrismaService.otpCode.findFirst.mockResolvedValue(null);

      await otpService.resendOtp(MOCK_PHONE, OtpType.PHONE_VERIFICATION, 7);

      const createArg = mockPrismaService.otpCode.create.mock.calls[0][0];
      expect(createArg.data.user_id).toBe(7);
    });

    it('[SUCCESS] should work with PASSWORD_RESET type', async () => {
      mockPrismaService.otpCode.findFirst.mockResolvedValue(null);

      const result = await otpService.resendOtp(
        MOCK_PHONE,
        OtpType.PASSWORD_RESET,
      );

      expect(result).toBe(MOCK_OTP_ID);
      const createArg = mockPrismaService.otpCode.create.mock.calls[0][0];
      expect(createArg.data.type).toBe(OtpType.PASSWORD_RESET);
    });
  });
});