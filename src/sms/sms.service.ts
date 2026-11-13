import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'crypto';

@Injectable()
export class SmsService {
  constructor(private readonly config: ConfigService) {}

  async enqueueVerification(tx: Prisma.TransactionClient, otpId: number, code: string, expiresAt: Date) {
    if (!['twilio', 'fake'].includes(this.config.get('SMS_PROVIDER', 'disabled'))) {
      throw new ServiceUnavailableException('SMS delivery is not configured');
    }
    const id = randomUUID();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(Buffer.from(`${id}:${otpId}`));
    const ciphertext = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
    const payload = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
    return tx.smsJob.create({ data: { id, otpId, payload, expiresAt } });
  }

  decrypt(job: { id: string; otpId: number; payload: string | null }) {
    const data = Buffer.from(job.payload ?? '', 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), data.subarray(0, 12));
    decipher.setAAD(Buffer.from(`${job.id}:${job.otpId}`));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
  }

  private key() {
    const value = this.config.get<string>('SMS_OUTBOX_KEY');
    if (!value || !/^[a-f0-9]{64}$/i.test(value)) throw new ServiceUnavailableException('SMS queue encryption is not configured');
    return Buffer.from(value, 'hex');
  }
}
