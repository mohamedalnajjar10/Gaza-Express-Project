import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export type SendOutcome =
  | { status: 'accepted'; providerId: string }
  | { status: 'retry'; code: 'rate_limited' }
  | { status: 'failed'; code: 'provider_rejected' | 'invalid_phone' }
  | { status: 'unknown'; code: 'transport_uncertain' };

export interface SmsProvider {
  send(phone: string, message: string, expiresAt: Date): Promise<SendOutcome>;
}

export class FakeSmsProvider implements SmsProvider {
  async send(): Promise<SendOutcome> {
    return { status: 'accepted', providerId: `fake-${randomUUID()}` };
  }
}

export class TwilioSmsProvider implements SmsProvider {
  private readonly account: string;
  private readonly auth: string;
  private readonly sender: string;

  constructor(config: ConfigService) {
    this.account = config.getOrThrow('TWILIO_ACCOUNT_SID');
    this.auth = Buffer.from(`${this.account}:${config.getOrThrow('TWILIO_AUTH_TOKEN')}`).toString('base64');
    this.sender = config.getOrThrow('TWILIO_MESSAGING_SERVICE_SID');
    if (!/^AC[a-f0-9]{32}$/i.test(this.account) || !/^MG[a-f0-9]{32}$/i.test(this.sender)) throw new Error('Invalid Twilio configuration');
  }

  async send(phone: string, message: string, expiresAt: Date): Promise<SendOutcome> {
    const to = /^0(59|56)\d{7}$/.test(phone) ? `+970${phone.slice(1)}` : phone;
    if (!/^\+[1-9]\d{7,14}$/.test(to)) return { status: 'failed', code: 'invalid_phone' };
    try {
      const body = new URLSearchParams({ To: to, MessagingServiceSid: this.sender, Body: message,
        ValidityPeriod: String(Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000))),
      });
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.account}/Messages.json`, {
        method: 'POST', headers: { Authorization: `Basic ${this.auth}` }, body, redirect: 'error', signal: AbortSignal.timeout(5000),
      });
      if (response.status === 429) return { status: 'retry', code: 'rate_limited' };
      if (response.status >= 400 && response.status < 500 && response.status !== 408) return { status: 'failed', code: 'provider_rejected' };
      if (response.status === 201) {
        const result = await response.json() as { sid?: string; status?: string };
        if (result.status === 'failed' || result.status === 'undelivered') return { status: 'failed', code: 'provider_rejected' };
        if (result.sid && /^SM[a-f0-9]{32}$/i.test(result.sid)) return { status: 'accepted', providerId: result.sid };
      }
    } catch {
      // Provider may have accepted the message before the connection failed.
    }
    return { status: 'unknown', code: 'transport_uncertain' };
  }
}

export function createSmsProvider(config: ConfigService): SmsProvider {
  const mode = config.get('SMS_PROVIDER', 'disabled');
  if (mode === 'twilio') return new TwilioSmsProvider(config);
  if (mode === 'fake' && config.get('NODE_ENV') !== 'production') return new FakeSmsProvider();
  throw new Error('Configure a supported SMS provider for the worker');
}
