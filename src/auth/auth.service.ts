import {
    Injectable,
    UnauthorizedException,
    BadRequestException,
    ForbiddenException,
    Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user/user.service';
import { OtpService } from '../otp/otp.service';
import { OtpType } from '@prisma/client';
import { User } from '@prisma/client';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { PrismaService } from 'prisma/prisma.service';
import { AUTH_ERROR_MESSAGES } from './constants/auth.constants';

export interface Tokens {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);
    constructor(
        private prisma: PrismaService,
        private userService: UserService,
        private otpService: OtpService,
        private jwtService: JwtService,
        private configService: ConfigService,
    ) { }

    async register(dto: RegisterDto) {
        try {
            const existingUser = await this.userService.findByPhone(dto.phone);

            if (existingUser) {
                if (!existingUser.is_verified) {
                    const otpId = await this.otpService.resendOtp(
                        dto.phone,
                        OtpType.PHONE_VERIFICATION,
                        existingUser.user_id,
                    );

                    return {
                        message: 'Account exists. Verification code resent',
                        otp_id: otpId,
                        user_id: existingUser.user_id,
                    };
                }

                throw new BadRequestException(
                    AUTH_ERROR_MESSAGES.MOBILE_ALREADY_REGISTERED
                );
            }

            const user = await this.userService.createUserForAuth(
                dto.phone,
                dto.password,
                dto.full_name,
                dto.full_name_ar,
                dto.email,
            );

            const otpId = await this.otpService.sendOtp(
                dto.phone,
                OtpType.PHONE_VERIFICATION,
                user.user_id,
            );

            return {
                message: 'Account created successfully. Please verify your phone number',
                otp_id: otpId,
                user_id: user.user_id,
            };

        } catch (error) {
            this.logger.error('Error occurred while registering user', error);
            if (error.code === 'P2002') {
                throw new BadRequestException(
                    error.meta?.target?.includes('phone')
                        ? AUTH_ERROR_MESSAGES.MOBILE_ALREADY_REGISTERED
                        : AUTH_ERROR_MESSAGES.EMAIL_ALREADY_REGISTERED
                );
            }
            throw error;
        }
    }

    async login(dto: LoginDto) {
        const user = await this.userService.findByPhone(dto.phone);
        if (!user) {
            throw new UnauthorizedException(AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
        }

        const isPasswordValid = await this.userService.validatePassword(
            user,
            dto.password,
        );
        if (!isPasswordValid) {
            throw new UnauthorizedException(AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
        }

        if (!user.is_verified) {
            throw new ForbiddenException('Please verify your phone number first');
        }

        const tokens = await this.generateTokens(user);
        await this.saveRefreshToken(user.user_id, tokens.refresh_token);
        await this.userService.updateLastLogin(user.user_id);

        return {
            tokens,
            message: 'Login successful',
        };
    }

    async verifyOtp(dto: VerifyOtpDto) {
        const otp = await this.otpService.verifyOtp(
            dto.phone,
            dto.code,
            OtpType.PHONE_VERIFICATION,
        );

        const user = otp.user || (await this.userService.findByPhone(dto.phone));
        if (!user) {
            throw new BadRequestException(AUTH_ERROR_MESSAGES.USER_NOT_FOUND);
        }

        if (!user.is_verified) {
            await this.userService.markAsVerified(user.user_id);
        }

        const tokens = await this.generateTokens(user);
        await this.saveRefreshToken(user.user_id, tokens.refresh_token);
        await this.userService.updateLastLogin(user.user_id);

        return {
            success: true,
            tokens,
            message: 'Verification successful',
        };
    }

    async resendOtp(phone: string) {
        const user = await this.userService.findByPhone(phone);
        if (!user) {
            throw new BadRequestException(AUTH_ERROR_MESSAGES.USER_NOT_FOUND);
        }

        const otpId = await this.otpService.resendOtp(
            phone,
            OtpType.PHONE_VERIFICATION,
            user.user_id,
        );

        return {
            message: 'New verification code sent',
            otp_id: otpId,
        };
    }

    async refreshToken(refreshToken: string) {
        const crypto = require('crypto');
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

        const storedToken = await this.prisma.refreshToken.findUnique({
            where: { token: tokenHash },
            include: { user: true },
        });

        if (!storedToken || storedToken.revoked_at || storedToken.expires_at < new Date()) {
            throw new UnauthorizedException('Invalid refresh token');
        }

        const tokens = await this.generateTokens(storedToken.user);
        await this.revokeRefreshToken(storedToken.token_id);
        await this.saveRefreshToken(storedToken.user.user_id, tokens.refresh_token);

        return {
            tokens,
            message: 'Token refreshed successfully',
        };
    }

    async logout(userId: number, refreshToken: string) {
        const updateData = {
            revoked_at: new Date(),
        };

        await this.prisma.refreshToken.updateMany({
            where: {
                user_id: userId,
                token: refreshToken,
            },
            data: updateData,
        });

        return { message: 'Logout successful' };
    }

    private async generateTokens(user: User): Promise<Tokens> {
        const payload: JwtPayload = {
            sub: user.user_id,
            phone: user.phone,
            role: user.role,
            isActive: user.is_active ?? false,
        };

        const jwtSecret = this.configService.get<string>('JWT_SECRET');
        const jwtRefreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');

        if (!jwtSecret || !jwtRefreshSecret || jwtSecret === jwtRefreshSecret) {
            this.logger.error('JWT configuration error: secrets must be different and set');
            throw new Error('JWT secrets must be different and properly configured');
        }

        const accessExpiryStr = this.configService.get<string>('JWT_EXPIRES_IN', '15m');
        const refreshExpiryStr = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');

        const accessExpirySec = this.parseExpiryToSeconds(accessExpiryStr);
        const refreshExpirySec = this.parseExpiryToSeconds(refreshExpiryStr);

        const access_token = this.jwtService.sign(payload, {
            secret: jwtSecret,
            expiresIn: accessExpirySec,
        });

        const refresh_token = this.jwtService.sign(payload, {
            secret: jwtRefreshSecret,
            expiresIn: refreshExpirySec,
        });

        return {
            access_token,
            refresh_token,
            expires_in: accessExpirySec,
        };
    }

    private parseExpiryToSeconds(expiry: string): number {
        const units: Record<string, number> = {
            s: 1,
            m: 60,
            h: 3600,
            d: 86400,
            w: 604800,
        };

        if (/^\d+$/.test(expiry)) {
            return parseInt(expiry, 10);
        }

        const match = expiry.match(/^(\d+)([smhdw])$/i);
        if (!match) {
            this.logger.warn(`Invalid expiry format: ${expiry}. Falling back to 15m.`);
            return 900;
        }

        const [, value, unit] = match;
        return parseInt(value, 10) * (units[unit.toLowerCase()] || 1);
    }

    private async saveRefreshToken(userId: number, token: string): Promise<void> {
        const refreshTokenExpiry = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
        const expiresAt = new Date(Date.now() + this.parseExpiryToSeconds(refreshTokenExpiry) * 1000);

        const crypto = require('crypto');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        await this.prisma.refreshToken.create({
            data: {
                user_id: userId,
                token: tokenHash,
                expires_at: expiresAt,
            },
        });
    }

    private async revokeRefreshToken(tokenId: number): Promise<void> {
        const updateData = {
            revoked_at: new Date(),
        };

        await this.prisma.refreshToken.update({
            where: { token_id: tokenId },
            data: updateData,
        });
    }
}