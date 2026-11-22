import { createHmac } from 'node:crypto';

export function hashOTP(otp: string, key: string, challenge: string, phone: string, purpose: string): string {
    return createHmac('sha256', key).update(JSON.stringify([challenge, phone, purpose, otp])).digest('hex');
}
