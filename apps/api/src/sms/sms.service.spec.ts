import { ConfigService } from '@nestjs/config';
import { TwilioSmsProvider, createSmsProvider } from './sms.provider';
import { SmsService } from './sms.service';
import type { Prisma } from '@prisma/client';
import { validateEnvironment, validateSmsEnvironment } from '../config/environment';

const config = () => new ConfigService({
  NODE_ENV: 'test', SMS_PROVIDER: 'fake', SMS_OUTBOX_KEY: 'a'.repeat(64),
  TWILIO_ACCOUNT_SID: `AC${'1'.repeat(32)}`, TWILIO_AUTH_TOKEN: 'test-token',
  TWILIO_MESSAGING_SERVICE_SID: `MG${'2'.repeat(32)}`,
});

describe('SMS outbox and provider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('stores encrypted OTPs and rejects ciphertext transplanted to another job', async () => {
    const service = new SmsService(config());
    const create = jest.fn(async ({ data }) => data);
    const tx = { smsJob: { create } } as unknown as Prisma.TransactionClient;
    const job = await service.enqueueVerification(tx, 1, '123456', new Date(Date.now() + 60_000));
    expect(job.payload).not.toBe('123456');
    expect(service.decrypt(job)).toBe('123456');
    expect(() => service.decrypt({ ...job, otpId: 2 })).toThrow();
  });

  it('fake provider accepts a request without writing secrets to stdout', async () => {
    const log = jest.spyOn(console, 'log');
    const provider = createSmsProvider(config());
    await expect(provider.send('0591234567', 'Secret code 123456', new Date())).resolves.toMatchObject({ status: 'accepted' });
    expect(log).not.toHaveBeenCalled();
  });

  it('normalizes a local phone number and submits a bounded Twilio request', async () => {
    const sid = `SM${'3'.repeat(32)}`;
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ sid, status: 'accepted' }), { status: 201 }));
    const provider = new TwilioSmsProvider(config());
    await expect(provider.send('0591234567', '123456', new Date(Date.now() + 60000))).resolves.toEqual({ status: 'accepted', providerId: sid });
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/api\.twilio\.com\//), expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) }));
    const body = fetch.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get('To')).toBe('+970591234567');
    expect(Number(body.get('ValidityPeriod'))).toBeLessThanOrEqual(60);
  });

  it.each([[429, 'retry'], [400, 'failed'], [503, 'unknown']] as const)('classifies HTTP %s as %s', async (status, expected) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status }));
    await expect(new TwilioSmsProvider(config()).send('+970591234567', '123456', new Date())).resolves.toMatchObject({ status: expected });
  });

  it('validates the production API and worker with only their own SMS secrets', () => {
    const outbox = { NODE_ENV: 'production', SMS_PROVIDER: 'twilio', SMS_OUTBOX_KEY: 'a'.repeat(64) };
    const api = {
      ...outbox, DATABASE_URL: 'mysql://api:example@localhost/wasla', REDIS_URL: 'redis://localhost',
      JWT_SECRET: 'b'.repeat(64), JWT_REFRESH_SECRET: 'c'.repeat(64),
      OTP_SIGNING_SECRET: 'd'.repeat(64), DELIVERY_CODE_SECRET: 'e'.repeat(64),
    };
    expect(validateEnvironment(api)).toBe(api);
    expect(() => validateSmsEnvironment(outbox)).toThrow('Twilio credentials');
    const worker = {
      ...outbox, TWILIO_ACCOUNT_SID: `AC${'1'.repeat(32)}`, TWILIO_AUTH_TOKEN: 'fixture',
      TWILIO_MESSAGING_SERVICE_SID: `MG${'2'.repeat(32)}`,
    };
    expect(validateSmsEnvironment(worker)).toBe(worker);
  });
});
