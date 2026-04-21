import {
    Injectable,
    BadRequestException,
    InternalServerErrorException,
    Logger
} from '@nestjs/common';
import { SmsService } from '../sms/sms.service';
import { generateOTP } from '../common/utils/otp-generator.util';
import { hashOTP } from '../common/utils/crypto.util';
import { OtpType } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class OtpService {
    private readonly logger = new Logger(OtpService.name);

    constructor(
        private prisma: PrismaService,
        private smsService: SmsService,
    ) { }

    async sendOtp(
        phone: string,
        type: OtpType,
        userId?: number
    ): Promise<number> {
        try {
            await this.prisma.otpCode.updateMany({
                where: {
                    phone,
                    type,
                    is_used: false
                },
                data: { is_used: true },
            });

            const code = generateOTP();
            const hashedCode = hashOTP(code);
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

            const otp = await this.prisma.otpCode.create({
                data: {
                    phone,
                    code: hashedCode,
                    type,
                    ...(userId && { user_id: userId }),
                    expires_at: expiresAt,
                    is_used: false,
                },
            });

            await this.smsService.sendVerificationCode(phone, code);

            this.logger.log(`OTP sent successfully to ${phone}`);
            return otp.otp_id;

        } catch (error) {
            this.logger.error(`Failed to send OTP to ${phone}`, error.stack);

            if (error instanceof BadRequestException) {
                throw error;
            }
            throw new InternalServerErrorException(
                'Failed to send verification code'
            );
        }
    }

    async verifyOtp(
        phone: string,
        code: string,
        type: OtpType
    ): Promise<any> {
        try {
            const hashedInput = hashOTP(code);

            const otp = await this.prisma.otpCode.findFirst({
                where: {
                    phone,
                    code: hashedInput,
                    type,
                    is_used: false,
                    expires_at: { gt: new Date() },
                },
                include: { user: true },
            });

            if (!otp) {
                throw new BadRequestException(
                    'Verification code is incorrect or expired'
                );
            }

            await this.prisma.otpCode.update({
                where: { otp_id: otp.otp_id },
                data: { is_used: true },
            });

            return otp;

        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            this.logger.error(`Failed to verify OTP for ${phone}`, error.stack);
            throw new InternalServerErrorException('Failed to verify the code');
        }
    }

    async resendOtp(
        phone: string,
        type: OtpType,
        userId?: number
    ): Promise<number> {
        const lastOtp = await this.prisma.otpCode.findFirst({
            where: { phone, type },
            orderBy: { created_at: 'desc' },
        });

        if (lastOtp) {
            const ONE_MINUTE = 60 * 1000;
            const timeDiff = Date.now() - lastOtp.created_at.getTime();

            if (timeDiff < ONE_MINUTE) {
                const remainingSeconds = Math.ceil(
                    (ONE_MINUTE - timeDiff) / 1000
                );
                throw new BadRequestException(
                    `Please wait ${remainingSeconds} seconds before requesting a new code`
                );
            }
        }

        return this.sendOtp(phone, type, userId);
    }
}