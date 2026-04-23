import { Test, TestingModule } from '@nestjs/testing';
import { SmsService } from './sms.service';
import { ConfigService } from '@nestjs/config';

const mockConfigService = {
  get: jest.fn(),
};

describe('SmsService', () => {
  let smsService: SmsService;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    smsService = module.get<SmsService>(SmsService);
    jest.clearAllMocks();

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => { });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // sendVerificationCode
  describe('sendVerificationCode()', () => {
    it('[SUCCESS] should resolve without throwing', async () => {
      await expect(
        smsService.sendVerificationCode('0592149436', '123456'),
      ).resolves.not.toThrow();
    });

    it('[SUCCESS] should return void (undefined)', async () => {
      const result = await smsService.sendVerificationCode(
        '0592149436',
        '123456',
      );

      expect(result).toBeUndefined();
    });

    it('[SUCCESS] should print code to console in development', async () => {
      await smsService.sendVerificationCode('0592149436', '123456');

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('[SUCCESS] should log phone number in console output', async () => {
      await smsService.sendVerificationCode('0592149436', '123456');

      const allCalls = consoleLogSpy.mock.calls.flat().join(' ');
      expect(allCalls).toContain('0592149436');
    });

    it('[SUCCESS] should log the OTP code in console output', async () => {
      await smsService.sendVerificationCode('0592149436', '123456');

      const allCalls = consoleLogSpy.mock.calls.flat().join(' ');
      expect(allCalls).toContain('123456');
    });

    it('[SUCCESS] should handle different phone formats', async () => {
      await expect(
        smsService.sendVerificationCode('+970592149436', '654321'),
      ).resolves.not.toThrow();
    });

    it('[SUCCESS] should handle 4-digit codes', async () => {
      await expect(
        smsService.sendVerificationCode('0592149436', '1234'),
      ).resolves.not.toThrow();
    });

    it('[SUCCESS] should handle 8-digit codes', async () => {
      await expect(
        smsService.sendVerificationCode('0592149436', '12345678'),
      ).resolves.not.toThrow();
    });

    it('[SUCCESS] should be callable multiple times', async () => {
      await smsService.sendVerificationCode('0592149436', '111111');
      await smsService.sendVerificationCode('0592149436', '222222');
      await smsService.sendVerificationCode('0592149436', '333333');

      const allOutput = consoleLogSpy.mock.calls.flat().join(' ');
      expect(allOutput).toContain('111111');
      expect(allOutput).toContain('222222');
      expect(allOutput).toContain('333333');
      expect(consoleLogSpy.mock.calls.length).toBeGreaterThan(0);
    });

    it('[SUCCESS] should log correct number of times per call', async () => {
      await smsService.sendVerificationCode('0592149436', '000000');
      const callsPerInvocation = consoleLogSpy.mock.calls.length;

      expect(callsPerInvocation).toBeGreaterThan(0);

      consoleLogSpy.mockClear();
      await smsService.sendVerificationCode('0592149436', '111111');
      await smsService.sendVerificationCode('0592149436', '222222');
      await smsService.sendVerificationCode('0592149436', '333333');

      expect(consoleLogSpy.mock.calls.length).toBe(callsPerInvocation * 3);
    });
  });

  // sendMessage
  describe('sendMessage()', () => {
    it('[SUCCESS] should resolve without throwing', async () => {
      await expect(
        smsService.sendMessage('0592149436', 'Hello'),
      ).resolves.not.toThrow();
    });

    it('[SUCCESS] should return void (undefined)', async () => {
      const result = await smsService.sendMessage('0592149436', 'Hello');

      expect(result).toBeUndefined();
    });

    it('[SUCCESS] should handle empty message', async () => {
      await expect(
        smsService.sendMessage('0592149436', ''),
      ).resolves.not.toThrow();
    });

    it('[SUCCESS] should handle long message', async () => {
      const longMessage = 'A'.repeat(500);

      await expect(
        smsService.sendMessage('0592149436', longMessage),
      ).resolves.not.toThrow();
    });

    it('[SUCCESS] should handle Arabic message', async () => {
      await expect(
        smsService.sendMessage('0592149436', 'مرحبا بك في غزة إكسبرس'),
      ).resolves.not.toThrow();
    });
  });
});