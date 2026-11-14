    import {
    Injectable,
    BadRequestException,
    InternalServerErrorException,
    ServiceUnavailableException,
    Logger
} from '@nestjs/common';
import { SmsService } from '../sms/sms.service';
import { generateOTP } from '../common/utils/otp-generator.util';
import { hashOTP } from '../common/utils/crypto.util';
import { OtpType } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AUTH_CONSTANTS, AUTH_ERROR_MESSAGES } from '../auth/constants/auth.constants';

@Injectable()
export class OtpService {
    private readonly logger = new Logger(OtpService.name);

    constructor(
        private prisma: PrismaService,
        private smsService: SmsService,
        private configService: ConfigService,
    ) { }

    async sendOtp(
        phone: string,
        type: OtpType,
        userId?: number
    ): Promise<number> {
        try {
            const code = generateOTP(AUTH_CONSTANTS.OTP_LENGTH);
            const otp = await this.prisma.$transaction(async tx => {
                // Lock the existing account: concurrent issuers across replicas serialize here.
                const users = await tx.$queryRaw<Array<{ user_id: number }>>`
                    SELECT user_id FROM users WHERE phone = ${phone} FOR UPDATE`;
                if (!users.length) throw new BadRequestException('Account not found');
                if (userId !== undefined && users[0].user_id !== userId) throw new BadRequestException('Account mismatch');
                const latest = await tx.otpCode.findFirst({ where: { phone, type }, orderBy: { created_at: 'desc' } });
                const cooldown = Number(this.configService.get('OTP_RESEND_COOLDOWN_MS', 60000));
                if (latest && Date.now() - latest.created_at.getTime() < cooldown) {
                    throw new BadRequestException('Please wait before requesting a new code');
                }
                await tx.otpCode.updateMany({ where: { phone, type, is_used: false }, data: { is_used: true } });
                const created = await tx.otpCode.create({ data: {
                    phone, type, code: hashOTP(code),
                    ...(userId && { user_id: userId }),
                    expires_at: new Date(Date.now() + AUTH_CONSTANTS.OTP_EXPIRY_SECONDS * 1000),
                    is_used: false,
                } });
                await this.smsService.enqueueVerification(tx, created.otp_id, code, created.expires_at);
                return created;
            });

            this.logger.log('Verification delivery requested');
            return otp.otp_id;

        } catch (error) {
            if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) {
                throw error;
            }
            this.logger.error('Verification delivery failed');
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
                throw new BadRequestException(AUTH_ERROR_MESSAGES.OTP_INVALID);
            }

            const consumed = await this.prisma.otpCode.updateMany({
                where: { otp_id: otp.otp_id, is_used: false, expires_at: { gt: new Date() } },
                data: { is_used: true },
            });

            if (consumed.count !== 1) throw new BadRequestException(AUTH_ERROR_MESSAGES.OTP_INVALID);
            return otp;

        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            this.logger.error('Verification failed');
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
            const cooldownMs = this.configService.get<number>('OTP_RESEND_COOLDOWN_MS', AUTH_CONSTANTS.OTP_RESEND_LOCK_SECONDS * 1000);
            const timeDiff = Date.now() - lastOtp.created_at.getTime();

            if (timeDiff < cooldownMs) {
                const remainingSeconds = Math.ceil((cooldownMs - timeDiff) / 1000);
                throw new BadRequestException(
                    `Please wait ${remainingSeconds} seconds before requesting a new code`
                );
            }
        }

        return this.sendOtp(phone, type, userId);
    }
}