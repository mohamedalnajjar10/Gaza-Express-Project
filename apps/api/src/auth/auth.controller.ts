import { ResendOtpDto } from './dto/resend-otp.dto';
import {
    Controller,
    Post,
    Body,
    HttpCode,
    HttpStatus,
    Get,
    Request,
    UseGuards,
    UnauthorizedException,
    Res,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import type { Request as ExpressRequest, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { RedisStorage } from '../infrastructure/redis.module';
import type { GoogleIdentity } from './strategies/google.strategy';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserService } from 'src/user/user.service';
import { googleExchangeCookie, GoogleAuthGuard, oauthCookie, readOAuthCookie } from 'src/common/guards/google-auth.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
    private readonly logger = new Logger(AuthController.name);

    constructor(
        private authService: AuthService,
        private userService: UserService,
        private configService: ConfigService,
        private redis: RedisStorage,
    ) { }

    @Public()
    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Create new account - OTP will be sent' })
    @ApiResponse({ status: 201, description: 'Account created successfully' })
    @ApiResponse({ status: 409, description: 'Phone number already registered' })
    async register(@Body() registerDto: RegisterDto) {
        return this.authService.register(registerDto);
    }

    @Public()
    @Post('login')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Login - without OTP' })
    @ApiResponse({ status: 200, description: 'Login successful' })
    @ApiResponse({ status: 401, description: 'Invalid credentials' })
    @ApiResponse({ status: 403, description: 'Please verify your phone number first' })
    async login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
    }

    @Public()
    @Post('verify-otp')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Verify OTP code' })
    @ApiResponse({ status: 200, description: 'Verification successful' })
    @ApiResponse({ status: 400, description: 'Invalid verification code' })
    async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
        return this.authService.verifyOtp(verifyOtpDto);
    }

    @Public()
    @Post('resend-otp')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Resend OTP (after 1 minute)' })
    async resendOtp(@Body() resendDto: ResendOtpDto) {
        return this.authService.resendOtp(resendDto.phone);
    }

    @Public()
    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Refresh access token' })
    @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
    @ApiResponse({ status: 401, description: 'Invalid refresh token' })
    async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
        return this.authService.refreshToken(refreshTokenDto.refresh_token);
    }

    @UseGuards(JwtAuthGuard)
    @Post('logout')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Logout' })
    @ApiBearerAuth()
    async logout(@Request() req, @Body() dto: RefreshTokenDto) {
        const userId = req.user?.user_id;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return this.authService.logout(userId, dto.refresh_token);
    }

    @UseGuards(JwtAuthGuard)
    @Get('profile')
    @ApiOperation({ summary: 'Get current user data' })
    @ApiBearerAuth()
    async getProfile(@Request() req) {
        return this.userService.findOnePublic(req.user.user_id);
    }

    // Google OAuth Endpoints
    @UseGuards(GoogleAuthGuard)
    @Get('google')
    @Public()
    async googleAuth() {
    }

    @Get('google/callback')
    @Public()
    @UseGuards(GoogleAuthGuard)
    async googleAuthRedirect(@Request() req: ExpressRequest & { user: GoogleIdentity }, @Res() res: Response) {
        const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
        res.setHeader('Cache-Control', 'no-store');
        try {
            const userId = await this.authService.handleGoogleLogin(req.user);
            const handoff = randomBytes(32).toString('hex');
            await this.redis.saveGoogleHandoff(createHash('sha256').update(handoff).digest('hex'), userId);
            const cookie = oauthCookie(this.configService, googleExchangeCookie, req.path.replace(/callback$/, 'exchange'));
            res.cookie(cookie.name, handoff, { ...cookie.options, maxAge: 60000 });
            return res.redirect(new URL('/auth/success', frontendUrl).toString());
        } catch {
            this.logger.warn('Google auth callback failed');
            return res.redirect(new URL('/auth/error?message=Authentication_failed', frontendUrl).toString());
        }
    }

    @Post('google/exchange')
    @HttpCode(200)
    @Public()
    async exchangeGoogleSession(@Request() req: ExpressRequest, @Res({ passthrough: true }) res: Response) {
        if (this.configService.get('GOOGLE_AUTH_ENABLED') !== 'true') throw new NotFoundException();
        if (req.headers.origin !== new URL(this.configService.getOrThrow<string>('FRONTEND_URL')).origin) {
            throw new UnauthorizedException('Invalid origin');
        }
        res.setHeader('Cache-Control', 'no-store');
        const cookie = oauthCookie(this.configService, googleExchangeCookie, req.path);
        res.clearCookie(cookie.name, cookie.options);
        const handoff = readOAuthCookie(req, cookie.name);
        if (!handoff) throw new UnauthorizedException('Google session expired');
        let userId: string | null;
        try { userId = await this.redis.consumeGoogleHandoff(createHash('sha256').update(handoff).digest('hex')); }
        catch { throw new ServiceUnavailableException('Session storage unavailable'); }
        if (!userId) throw new UnauthorizedException('Google session expired');
        return this.authService.issueGoogleSession(Number(userId));
    }
}
