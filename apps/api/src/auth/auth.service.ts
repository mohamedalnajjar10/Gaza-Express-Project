import type { GoogleIdentity } from './strategies/google.strategy';
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
import { OtpType, Prisma, User } from '@prisma/client';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { PrismaService } from 'prisma/prisma.service';
import { AUTH_CONSTANTS, AUTH_ERROR_MESSAGES } from './constants/auth.constants';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

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
        await this.otpService.sendSignup(dto.phone, true);
        return { message: 'If verification is available, a code will be sent' };
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
        await this.saveCurrentSession(user, tokens.refresh_token);
        await this.userService.updateLastLogin(user.user_id);

        return {
            tokens,
            message: 'Login successful',
            user: {
                id: user.user_id,
                phone: user.phone,
                full_name: user.full_name,
                full_name_ar: user.full_name_ar,
                role: user.role,
                is_verified: user.is_verified,
            }
        };
    }

    async verifyOtp(dto: VerifyOtpDto) {
        const tokens = await this.otpService.verifyOtp(dto.phone, dto.code, OtpType.PHONE_VERIFICATION, async (tx, userId) => {
            const user = await tx.user.update({
                where: { user_id: userId },
                data: {
                    full_name: dto.full_name.trim(),
                    full_name_ar: dto.full_name_ar?.trim() ?? null,
                    email: dto.email?.toLowerCase() ?? null,
                    role: dto.role ?? 'customer',
                    password_hash: await bcrypt.hash(dto.password, AUTH_CONSTANTS.BCRYPT_ROUNDS),
                    is_verified: true,
                    last_seen_at: new Date(),
                },
            });
            const session = await this.generateTokens(user);
            await this.saveRefreshToken(user.user_id, session.refresh_token, tx);
            return session;
        });
        return { success: true, tokens, message: 'Verification successful' };
    }

    async resendOtp(phone: string) {
        await this.otpService.sendSignup(phone, false);
        return { message: 'If verification is available, a code will be sent' };
    }

    async refreshToken(refreshToken: string) {
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

        const storedToken = await this.prisma.refreshToken.findUnique({
            where: { token: tokenHash },
            include: { user: true },
        });

        if (!storedToken || storedToken.revoked_at || storedToken.expires_at < new Date()) {
            throw new UnauthorizedException('Invalid refresh token');
        }

        const tokens = await this.prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT user_id FROM users WHERE user_id = ${storedToken.user_id} FOR UPDATE`;
            const user = await tx.user.findUnique({ where: { user_id: storedToken.user_id } });
            if (!user || user.sessionVersion !== storedToken.user.sessionVersion) {
                throw new UnauthorizedException('Session changed');
            }
            const tokens = await this.generateTokens(user);
            const consumed = await tx.refreshToken.updateMany({
                where: { token_id: storedToken.token_id, revoked_at: null, expires_at: { gt: new Date() } },
                data: { revoked_at: new Date() },
            });
            if (consumed.count !== 1) throw new UnauthorizedException('Refresh token already consumed');
            await tx.refreshToken.create({ data: {
                user_id: storedToken.user.user_id,
                token: crypto.createHash('sha256').update(tokens.refresh_token).digest('hex'),
                expires_at: new Date(Date.now() + this.parseExpiryToSeconds(this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d')) * 1000),
            } });
            return tokens;
        });

        return {
            tokens,
            message: 'Token refreshed successfully',
        };
    }

    async logout(userId: number, refreshToken: string) {
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

        await this.prisma.refreshToken.updateMany({
            where: {
                user_id: userId,
                token: tokenHash,
            },
            data: { revoked_at: new Date() },
        });

        return { message: 'Logout successful' };
    }

    private async generateTokens(user: User): Promise<Tokens> {
        if (!user.is_active || !user.is_verified) throw new ForbiddenException('Account unavailable');
        const payload: JwtPayload = {
            sub: user.user_id,
            sessionVersion: user.sessionVersion,
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
            jwtid: crypto.randomUUID(),
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

    private async saveCurrentSession(user: User, token: string) {
        await this.prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT user_id FROM users WHERE user_id = ${user.user_id} FOR UPDATE`;
            const current = await tx.user.findUnique({ where: { user_id: user.user_id } });
            if (!current?.is_active || current.sessionVersion !== user.sessionVersion) {
                throw new UnauthorizedException('Session changed');
            }
            await this.saveRefreshToken(user.user_id, token, tx);
        });
    }

    private async saveRefreshToken(userId: number, token: string, tx: Prisma.TransactionClient): Promise<void> {
        const refreshTokenExpiry = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
        const expiresAt = new Date(Date.now() + this.parseExpiryToSeconds(refreshTokenExpiry) * 1000);

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        await tx.refreshToken.create({
            data: {
                user_id: userId,
                token: tokenHash,
                expires_at: expiresAt,
            },
        });
    }

    async handleGoogleLogin(identity: GoogleIdentity): Promise<number> {
        let user = await this.userService.findByGoogleId(identity.googleId);
        if (!user) {
            if (await this.userService.findByEmail(identity.email)) {
                throw new UnauthorizedException('Google account is not linked to this login');
            }
            user = await this.userService.createGoogleUser(identity);
        }
        if (!user.is_active) throw new UnauthorizedException('Account disabled');
        return user.user_id;
    }

    async issueGoogleSession(userId: number) {
        const user = await this.userService.findById(userId);
        if (!user?.googleId || !user.is_active) throw new UnauthorizedException('Account unavailable');
        const tokens = await this.generateTokens(user);
        await this.saveCurrentSession(user, tokens.refresh_token);
        await this.userService.updateLastLogin(user.user_id);
        return { tokens, user: { id: user.user_id, email: user.email, full_name: user.full_name, role: user.role } };
    }
}
