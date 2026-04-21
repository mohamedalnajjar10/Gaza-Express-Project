import {
    Injectable,
    UnauthorizedException,
    BadRequestException,
    ForbiddenException,
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

export interface Tokens {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}

@Injectable()
export class AuthService {
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
                    'Phone number already registered'
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
            if (error.code === 'P2002') {
                throw new BadRequestException(
                    `${error.meta?.target?.includes('phone')
                        ? 'Phone number'
                        : 'Email'} already registered`
                );
            }
            throw error;
        }
    }

    async login(dto: LoginDto) {
        const user = await this.userService.findByPhone(dto.phone);
        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const isPasswordValid = await this.userService.validatePassword(
            user,
            dto.password,
        );
        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid credentials');
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
            throw new BadRequestException('User not found');
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
            throw new BadRequestException('User not found');
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
        const storedToken = await this.prisma.refreshToken.findUnique({
            where: { token: refreshToken },
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
        };

        const access_token = this.jwtService.sign(payload, {
            secret: this.configService.get('JWT_SECRET'),
            expiresIn: this.configService.get('JWT_EXPIRES_IN', '15m'),
        });

        const refresh_token = this.jwtService.sign(payload, {
            secret: this.configService.get('JWT_REFRESH_SECRET'),
            expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
        });

        return {
            access_token,
            refresh_token,
            expires_in: 900,
        };
    }

    private async saveRefreshToken(userId: number, token: string): Promise<void> {
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        const createData = {
            user_id: userId,
            token,
            expires_at: expiresAt,
        };

        await this.prisma.refreshToken.create({
            data: createData,
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