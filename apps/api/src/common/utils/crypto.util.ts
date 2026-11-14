import * as crypto from 'crypto';

export function hashOTP(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
}

export function verifyOTP(plainOtp: string, hashedOtp: string): boolean {
    const hash = hashOTP(plainOtp);
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hashedOtp));
}