import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
    private readonly logger = new Logger(SmsService.name);

    constructor(private configService: ConfigService) { }

    async sendVerificationCode(phone: string, code: string): Promise<void> {
        const message = `Gaza Express - Verification code is: ${code}\nValid for 5 minutes. Do not share it with anyone.`;

        try {
            this.logger.log(`📱 Sending SMS to ${phone}: ${code}`);

            console.log(`\n🔐 ========================================`);
            console.log(`📱 SMS Verification Code for ${phone}:`);
            console.log(`🔢 Code: ${code}`);
            console.log(`⏰ Valid for 5 minutes`);
            console.log(`🔐 ========================================\n`);



        } catch (error) {
            this.logger.error('Failed to send SMS', error);
            throw error;
        }
    }

    async sendMessage(phone: string, message: string): Promise<void> {
        this.logger.log(`Sending SMS to ${phone}: ${message}`);
    }
}
