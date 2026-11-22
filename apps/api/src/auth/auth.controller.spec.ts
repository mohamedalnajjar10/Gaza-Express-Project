import { RedisStorage } from '../infrastructure/redis.module';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';
import { GoogleAuthGuard } from '../common/guards/google-auth.guard';
import {
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';

// Mocks
const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  verifyOtp: jest.fn(),
  resendOtp: jest.fn(),
  refreshToken: jest.fn(),
  logout: jest.fn(),
  handleGoogleLogin: jest.fn(),
  issueGoogleSession: jest.fn(),
};

const mockUserService = {
  findByPhone: jest.fn(),
  findById: jest.fn(),
  findOnePublic: jest.fn(),
  validatePassword: jest.fn(),
  createUserForAuth: jest.fn(),
  markAsVerified: jest.fn(),
  updateLastLogin: jest.fn(),
};

const mockTokens = {
  access_token: 'mock.access.token',
  refresh_token: 'mock.refresh.token',
  expires_in: 900,
};

const mockConfigService = {
  getOrThrow: jest.fn().mockReturnValue('http://localhost:3000'),
  get: jest.fn(),
};

const mockUserPublic = {
  user_id: 1,
  phone: '0592149436',
  email: 'test@example.com',
  full_name: 'Test User',
  is_verified: true,
};

// Test Suite
const redis = { saveGoogleHandoff: jest.fn(), consumeGoogleHandoff: jest.fn() };

describe('AuthController', () => {
  let authController: AuthController;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: RedisStorage, useValue: redis },
        { provide: AuthService, useValue: mockAuthService },
        { provide: UserService, useValue: mockUserService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(GoogleAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    authController = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
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

    it('[SUCCESS] should call authService.register and return result', async () => {
      const expected = {
        message: 'Account created successfully',
        otp_id: 1,
        user_id: 1,
      };
      mockAuthService.register.mockResolvedValue(expected);

      const result = await authController.register(dto);

      expect(result).toEqual(expected);
      expect(mockAuthService.register).toHaveBeenCalledWith(dto);
      expect(mockAuthService.register).toHaveBeenCalledTimes(1);
    });

    it('[ERROR] should propagate exception from service', async () => {
      mockAuthService.register.mockRejectedValue(
        new BadRequestException('Phone already registered'),
      );

      await expect(authController.register(dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // login
  describe('login()', () => {
    const dto = { phone: '0592149436', password: 'Password123!' };

    it('[SUCCESS] should return tokens on valid login', async () => {
      const expected = {
        tokens: mockTokens,
        message: 'Logged in successfully',
      };
      mockAuthService.login.mockResolvedValue(expected);

      const result = await authController.login(dto);

      expect(result).toEqual(expected);
      expect(mockAuthService.login).toHaveBeenCalledWith(dto);
    });

    it('[ERROR] should propagate UnauthorizedException', async () => {
      mockAuthService.login.mockRejectedValue(
        new UnauthorizedException('Invalid credentials'),
      );

      await expect(authController.login(dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // verifyOtp
  describe('verifyOtp()', () => {
    const dto = { phone: '0592149436', code: '123456', full_name: 'Fixture', password: 'Password123!' };

    it('[SUCCESS] should verify OTP and return tokens', async () => {
      const expected = {
        success: true,
        tokens: mockTokens,
        message: 'Verified successfully',
      };
      mockAuthService.verifyOtp.mockResolvedValue(expected);

      const result = await authController.verifyOtp(dto);

      expect(result).toEqual(expected);
      expect(mockAuthService.verifyOtp).toHaveBeenCalledWith(dto);
    });

    it('[ERROR] should propagate BadRequestException', async () => {
      mockAuthService.verifyOtp.mockRejectedValue(
        new BadRequestException('Invalid OTP'),
      );

      await expect(authController.verifyOtp(dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // resendOtp
  describe('resendOtp()', () => {
    it('[SUCCESS] should call resendOtp with phone', async () => {
      const expected = { message: 'OTP resent', otp_id: 2 };
      mockAuthService.resendOtp.mockResolvedValue(expected);

      const result = await authController.resendOtp({ phone: '0592149436' });

      expect(result).toEqual(expected);
      expect(mockAuthService.resendOtp).toHaveBeenCalledWith('0592149436');
    });
  });

  // refresh
  describe('refresh()', () => {
    it('[SUCCESS] should return new tokens', async () => {
      const expected = { tokens: mockTokens, message: 'Token refreshed' };
      mockAuthService.refreshToken.mockResolvedValue(expected);

      const result = await authController.refreshToken({
        refresh_token: 'valid.refresh.token',
      });

      expect(result).toEqual(expected);
    });

    it('[ERROR] should propagate UnauthorizedException', async () => {
      mockAuthService.refreshToken.mockRejectedValue(
        new UnauthorizedException('Invalid refresh token'),
      );

      await expect(
        authController.refreshToken({ refresh_token: 'bad' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // logout
  describe('logout()', () => {
    it('[SUCCESS] should logout user', async () => {
      const expected = { message: 'Logged out successfully' };
      mockAuthService.logout.mockResolvedValue(expected);

      const mockReq = { user: { user_id: 1 } };
      const result = await authController.logout(mockReq as any, {
        refresh_token: 'valid.token',
      });

      expect(result).toEqual(expected);
      expect(mockAuthService.logout).toHaveBeenCalledWith(1, 'valid.token');
    });
  });

  // getProfile
  describe('getProfile()', () => {
    it('[SUCCESS] should return user profile', async () => {
      mockUserService.findOnePublic.mockResolvedValue(mockUserPublic);

      const mockReq = { user: { user_id: 1 } };
      const result = await authController.getProfile(mockReq as any);

      expect(result).toEqual(mockUserPublic);
      expect(mockUserService.findOnePublic).toHaveBeenCalledWith(1);
    });

    it('[ERROR] should throw TypeError if user is null (reflects real behavior)', async () => {
      const mockReq = { user: null };

      await expect(
        authController.getProfile(mockReq as any),
      ).rejects.toThrow(TypeError);
    });

    it('[SUCCESS] should call findOnePublic with undefined if user_id missing', async () => {
      mockUserService.findOnePublic.mockResolvedValue(mockUserPublic);

      const mockReq = { user: {} };
      await authController.getProfile(mockReq as any);

      expect(mockUserService.findOnePublic).toHaveBeenCalledWith(undefined);
    });

    it('[ERROR] should propagate NotFoundException from userService', async () => {
      mockUserService.findOnePublic.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      const mockReq = { user: { user_id: 999 } };

      await expect(
        authController.getProfile(mockReq as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // googleAuth
  describe('googleAuth()', () => {
    it('[SUCCESS] should execute without errors', async () => {
      // This endpoint is just a trigger for the guard
      await expect(authController.googleAuth()).resolves.toBeUndefined();
    });
  });

  describe('Google OAuth handoff', () => {
    it('redirects without credentials and creates a short-lived HttpOnly cookie', async () => {
      const req = { user: { email: 'test@gmail.com' }, path: '/api/v1/auth/google/callback' };
      const res = { redirect: jest.fn(), cookie: jest.fn(), setHeader: jest.fn() };
      mockAuthService.handleGoogleLogin.mockResolvedValue(1);
      await authController.googleAuthRedirect(req as any, res as any);
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/auth/success');
      expect(res.cookie).toHaveBeenCalledWith('wasla_google_exchange', expect.stringMatching(/^[a-f0-9]{64}$/), expect.objectContaining({ httpOnly: true, maxAge: 60000, path: '/api/v1/auth/google/exchange' }));
      expect(redis.saveGoogleHandoff).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/), 1);
    });

    it('rejects handoff reuse and cross-origin exchanges', async () => {
      mockConfigService.get.mockReturnValue('true');
      const res = { setHeader: jest.fn(), clearCookie: jest.fn() };
      const request = (origin: string) => ({ headers: { origin, cookie: `wasla_google_exchange=${'a'.repeat(64)}` }, path: '/api/v1/auth/google/exchange' });
      await expect(authController.exchangeGoogleSession(request('https://other.invalid') as any, res as any)).rejects.toMatchObject({ status: 401 });
      redis.consumeGoogleHandoff.mockResolvedValueOnce('1').mockResolvedValueOnce(null);
      mockAuthService.issueGoogleSession.mockResolvedValue({ tokens: {} });
      await expect(authController.exchangeGoogleSession(request('http://localhost:3000') as any, res as any)).resolves.toEqual({ tokens: {} });
      await expect(authController.exchangeGoogleSession(request('http://localhost:3000') as any, res as any)).rejects.toMatchObject({ status: 401 });
    });
  });
});
