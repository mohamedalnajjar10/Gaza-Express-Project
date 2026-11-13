import { createHash } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { OtpService } from '../otp/otp.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OtpType, UserRole, LanguagePref } from '@prisma/client';

// Fixtures
const mockUser = {
  user_id: 1,
  phone: '0592149436',
  email: 'test@example.com',
  password_hash: '$2b$10$hashedpassword',
  full_name: 'Test User',
  full_name_ar: 'مستخدم تجريبي',
  role: UserRole.customer,
  is_active: true,
  is_verified: true,
  language_pref: LanguagePref.ar,
  profile_photo_url: null,
  device_token: null,
  last_seen_at: null,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

const mockUnverifiedUser = { ...mockUser, is_verified: false };

const mockRefreshTokenRecord = {
  token_id: 1,
  user_id: 1,
  token: 'valid.refresh.token',
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  revoked_at: null,
  created_at: new Date(),
  user: mockUser,
};

// Mocks
const mockUserService = {
  findByPhone: jest.fn(),
  findByEmail: jest.fn(),
  findById: jest.fn(),
  findOnePublic: jest.fn(),
  validatePassword: jest.fn(),
  createUserForAuth: jest.fn(),
  markAsVerified: jest.fn(),
  updateLastLogin: jest.fn(),
  findByGoogleId: jest.fn(),
  linkGoogleAccount: jest.fn(),
  createGoogleUser: jest.fn(),
};

const mockOtpService = {
  sendOtp: jest.fn(),
  verifyOtp: jest.fn(),
  resendOtp: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn(),
  verify: jest.fn(),
};

const mockConfigService = {
  get: jest.fn(),
};

const mockPrismaService = {
  $transaction: jest.fn(),
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

// Test Suite
describe('AuthService', () => {
  let authService: AuthService;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: mockUserService },
        { provide: OtpService, useValue: mockOtpService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation(fn => fn(mockPrismaService));
    mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 1 });

    mockConfigService.get.mockImplementation((key: string, def?: any) => {
      const configs: Record<string, any> = {
        JWT_SECRET: 'super-secret-key-minimum-32-characters!!',
        JWT_REFRESH_SECRET: 'super-refresh-secret-minimum-32-chars!!',
        JWT_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '7d',
      };
      return configs[key] ?? def;
    });

    mockJwtService.sign.mockReturnValue('signed.jwt.token');
    mockPrismaService.refreshToken.create.mockResolvedValue(mockRefreshTokenRecord);
    mockUserService.updateLastLogin.mockResolvedValue(undefined);
  });

  // register
  describe('register()', () => {
    const dto = {
      phone: '0592149436',
      password: 'Password123!',
      full_name: 'Test User',
      full_name_ar: 'مستخدم تجريبي',
      email: 'test@example.com',
    };

    it('[SUCCESS] should register new user and send OTP', async () => {
      mockUserService.findByPhone.mockResolvedValue(null);
      mockUserService.createUserForAuth.mockResolvedValue(mockUser);
      mockOtpService.sendOtp.mockResolvedValue(1);

      const result = await authService.register(dto);

      expect(result).toMatchObject({
        otp_id: expect.any(Number),
        user_id: mockUser.user_id,
      });
      expect(result.message).toBeDefined();
      expect(mockUserService.createUserForAuth).toHaveBeenCalledWith(
        dto.phone,
        dto.password,
        dto.full_name,
        dto.full_name_ar,
        dto.email,
        undefined,
      );
      expect(mockOtpService.sendOtp).toHaveBeenCalledWith(
        dto.phone,
        OtpType.PHONE_VERIFICATION,
        mockUser.user_id,
      );
    });

    it('[SUCCESS] should register without optional email', async () => {
      const dtoWithoutEmail = { ...dto, email: undefined };
      mockUserService.findByPhone.mockResolvedValue(null);
      mockUserService.createUserForAuth.mockResolvedValue({
        ...mockUser,
        email: null,
      });
      mockOtpService.sendOtp.mockResolvedValue(1);

      const result = await authService.register(dtoWithoutEmail);

      expect(result.user_id).toBeDefined();
      expect(mockUserService.findByEmail).not.toHaveBeenCalled();
    });

    it('[BLOCKED] should throw when phone exists and user is verified', async () => {
      mockUserService.findByPhone.mockResolvedValue(mockUser);

      await expect(authService.register(dto)).rejects.toThrow();
      expect(mockUserService.createUserForAuth).not.toHaveBeenCalled();
    });

    it('[RESEND] should resend OTP if phone exists but unverified', async () => {
      mockUserService.findByPhone.mockResolvedValue(mockUnverifiedUser);
      mockOtpService.resendOtp.mockResolvedValue(2);

      const result = await authService.register(dto);

      expect(result).toMatchObject({
        user_id: mockUnverifiedUser.user_id,
        otp_id: 2,
      });
      expect(mockOtpService.resendOtp).toHaveBeenCalledWith(
        dto.phone,
        OtpType.PHONE_VERIFICATION,
        mockUnverifiedUser.user_id,
      );
      expect(mockUserService.createUserForAuth).not.toHaveBeenCalled();
    });

    it('[ERROR] should propagate error if OTP send fails', async () => {
      mockUserService.findByPhone.mockResolvedValue(null);
      mockUserService.createUserForAuth.mockResolvedValue(mockUser);
      mockOtpService.sendOtp.mockRejectedValue(new Error('SMS failed'));

      await expect(authService.register(dto)).rejects.toThrow();
    });
  });

  // login
  describe('login()', () => {
    const dto = { phone: '0592149436', password: 'Password123!' };

    it('[SUCCESS] should login and return tokens', async () => {
      mockUserService.findByPhone.mockResolvedValue(mockUser);
      mockUserService.validatePassword.mockResolvedValue(true);

      const result = await authService.login(dto);

      expect(result).toMatchObject({
        tokens: {
          access_token: expect.any(String),
          refresh_token: expect.any(String),
          expires_in: 900,
        },
      });
      expect(result.message).toBeDefined();
      expect(mockUserService.updateLastLogin).toHaveBeenCalledWith(
        mockUser.user_id,
      );
    });

    it('[UNAUTHORIZED] should throw if user not found', async () => {
      mockUserService.findByPhone.mockResolvedValue(null);

      await expect(authService.login(dto)).rejects.toThrow(UnauthorizedException);
      expect(mockUserService.validatePassword).not.toHaveBeenCalled();
    });

    it('[UNAUTHORIZED] should throw if password is wrong', async () => {
      mockUserService.findByPhone.mockResolvedValue(mockUser);
      mockUserService.validatePassword.mockResolvedValue(false);

      await expect(authService.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('[FORBIDDEN] should throw if user is not verified', async () => {
      mockUserService.findByPhone.mockResolvedValue(mockUnverifiedUser);
      mockUserService.validatePassword.mockResolvedValue(true);

      await expect(authService.login(dto)).rejects.toThrow(ForbiddenException);
    });

    it('[SUCCESS] should save refresh token after login', async () => {
      mockUserService.findByPhone.mockResolvedValue(mockUser);
      mockUserService.validatePassword.mockResolvedValue(true);

      await authService.login(dto);

      expect(mockPrismaService.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            user_id: mockUser.user_id,
            token: expect.any(String),
            expires_at: expect.any(Date),
          }),
        }),
      );
    });
  });

  // verifyOtp
  describe('verifyOtp()', () => {
    const dto = { phone: '0592149436', code: '123456' };

    const mockOtpResult = {
      otp_id: 1,
      phone: '0592149436',
      code: 'hashed',
      type: OtpType.PHONE_VERIFICATION,
      is_used: false,
      expires_at: new Date(Date.now() + 300000),
      created_at: new Date(),
      user_id: 1,
      user: mockUnverifiedUser,
    };

    it('[SUCCESS] should verify OTP and return tokens', async () => {
      mockOtpService.verifyOtp.mockResolvedValue(mockOtpResult);
      mockUserService.markAsVerified.mockResolvedValue(mockUser);

      const result = await authService.verifyOtp(dto);

      expect(result.success).toBe(true);
      expect(result.tokens).toBeDefined();
      expect(mockUserService.markAsVerified).toHaveBeenCalledWith(
        mockUnverifiedUser.user_id,
      );
    });

    it('[SUCCESS] should not markAsVerified for already verified user', async () => {
      const otpWithVerifiedUser = { ...mockOtpResult, user: mockUser };
      mockOtpService.verifyOtp.mockResolvedValue(otpWithVerifiedUser);

      await authService.verifyOtp(dto);

      expect(mockUserService.markAsVerified).not.toHaveBeenCalled();
    });

    it('[FALLBACK] should findByPhone if otp.user is null', async () => {
      const otpWithNullUser = { ...mockOtpResult, user: null };
      mockOtpService.verifyOtp.mockResolvedValue(otpWithNullUser);
      mockUserService.findByPhone.mockResolvedValue(mockUser);

      await authService.verifyOtp(dto);

      expect(mockUserService.findByPhone).toHaveBeenCalledWith(dto.phone);
    });

    it('[ERROR] should throw if user not found after OTP verify', async () => {
      const otpWithNullUser = { ...mockOtpResult, user: null };
      mockOtpService.verifyOtp.mockResolvedValue(otpWithNullUser);
      mockUserService.findByPhone.mockResolvedValue(null);

      await expect(authService.verifyOtp(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('[ERROR] should propagate invalid OTP error', async () => {
      mockOtpService.verifyOtp.mockRejectedValue(
        new BadRequestException('Invalid OTP'),
      );

      await expect(authService.verifyOtp(dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // resendOtp
  describe('resendOtp()', () => {
    it('[SUCCESS] should resend OTP', async () => {
      mockUserService.findByPhone.mockResolvedValue(mockUser);
      mockOtpService.resendOtp.mockResolvedValue(3);

      const result = await authService.resendOtp('0592149436');

      expect(result.otp_id).toBe(3);
      expect(result.message).toBeDefined();
    });

    it('[ERROR] should throw if user not found', async () => {
      mockUserService.findByPhone.mockResolvedValue(null);

      await expect(authService.resendOtp('0000000000')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // refreshToken
  describe('refreshToken()', () => {
    it('[SUCCESS] should return new tokens', async () => {
      mockPrismaService.refreshToken.findUnique.mockResolvedValue(
        mockRefreshTokenRecord,
      );
      mockPrismaService.refreshToken.update.mockResolvedValue({});

      const result = await authService.refreshToken('valid.refresh.token');

      expect(result.tokens).toBeDefined();
    });

    it('[UNAUTHORIZED] should throw if token not found', async () => {
      mockPrismaService.refreshToken.findUnique.mockResolvedValue(null);

      await expect(authService.refreshToken('bad')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('[UNAUTHORIZED] should throw if token revoked', async () => {
      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        ...mockRefreshTokenRecord,
        revoked_at: new Date(),
      });

      await expect(authService.refreshToken('revoked')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('[UNAUTHORIZED] should throw if token expired', async () => {
      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        ...mockRefreshTokenRecord,
        expires_at: new Date(Date.now() - 1000),
      });

      await expect(authService.refreshToken('expired')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // logout
  describe('logout()', () => {
    it('[SUCCESS] should revoke refresh token', async () => {
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const result = await authService.logout(1, 'valid.token');

      expect(result.message).toBeDefined();
      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { user_id: 1, token: createHash('sha256').update('valid.token').digest('hex') },
        data: { revoked_at: expect.any(Date) },
      });
    });

    it('[IDEMPOTENT] should not throw if token not found', async () => {
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        authService.logout(1, 'ghost.token'),
      ).resolves.toBeDefined();
    });
  });

  // handleGoogleLogin
  describe('handleGoogleLogin()', () => {
    const googleUserData = {
      googleId: 'google-123',
      email: 'test@gmail.com',
      full_name: 'Google User',
      profile_photo_url: 'http://photo.url',
    };

    it('matches the already linked provider subject', async () => {
      mockUserService.findByGoogleId.mockResolvedValue({ ...mockUser, googleId: 'google-123' });
      await expect(authService.handleGoogleLogin(googleUserData)).resolves.toBe(mockUser.user_id);
      expect(mockUserService.findByEmail).not.toHaveBeenCalled();
    });

    it.each([null, 'different-google-subject'])('rejects email-only matching with subject %s', async (googleId) => {
      mockUserService.findByGoogleId.mockResolvedValue(null);
      mockUserService.findByEmail.mockResolvedValue({ ...mockUser, googleId });
      await expect(authService.handleGoogleLogin(googleUserData)).rejects.toThrow(UnauthorizedException);
      expect(mockUserService.linkGoogleAccount).not.toHaveBeenCalled();
    });

    it('provisions a Google subject with no existing email match', async () => {
      mockUserService.findByGoogleId.mockResolvedValue(null);
      mockUserService.findByEmail.mockResolvedValue(null);
      mockUserService.createGoogleUser.mockResolvedValue(mockUser);
      await expect(authService.handleGoogleLogin(googleUserData)).resolves.toBe(mockUser.user_id);
      expect(mockUserService.createGoogleUser).toHaveBeenCalledWith(googleUserData);
    });
  });
});
