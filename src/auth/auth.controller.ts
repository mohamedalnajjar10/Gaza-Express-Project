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
} from '@nestjs/common';
import type { Response } from 'express';
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
import { Throttle } from '@nestjs/throttler';
import { AUTH_CONSTANTS } from './constants/auth.constants';
import { GoogleAuthGuard } from 'src/common/guards/google-auth.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
    private readonly logger = new Logger(AuthController.name);

    constructor(
        private authService: AuthService,
        private userService: UserService,
        private configService: ConfigService,
    ) { }

    @Public()
    @Throttle({ default: { limit: AUTH_CONSTANTS.MAX_LOGIN_ATTEMPTS, ttl: AUTH_CONSTANTS.LOGIN_BLOCK_SECONDS * 1000 } })
    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Create new account - OTP will be sent' })
    @ApiResponse({ status: 201, description: 'Account created successfully' })
    @ApiResponse({ status: 409, description: 'Phone number already registered' })
    async register(@Body() registerDto: RegisterDto) {
        return this.authService.register(registerDto);
    }

    @Public()
    @Throttle({ default: { limit: AUTH_CONSTANTS.MAX_LOGIN_ATTEMPTS, ttl: AUTH_CONSTANTS.LOGIN_BLOCK_SECONDS * 1000 } })
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
    @Throttle({ default: { limit: AUTH_CONSTANTS.MAX_OTP_ATTEMPTS, ttl: AUTH_CONSTANTS.OTP_BLOCK_SECONDS * 1000 } })
    @Post('verify-otp')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Verify OTP code' })
    @ApiResponse({ status: 200, description: 'Verification successful' })
    @ApiResponse({ status: 400, description: 'Invalid verification code' })
    async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
        return this.authService.verifyOtp(verifyOtpDto);
    }

    @Public()
    @Throttle({ default: { limit: AUTH_CONSTANTS.MAX_OTP_ATTEMPTS, ttl: AUTH_CONSTANTS.OTP_BLOCK_SECONDS * 1000 } })
    @Post('resend-otp')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Resend OTP (after 1 minute)' })
    async resendOtp(@Body() resendDto: { phone: string }) {
        return this.authService.resendOtp(resendDto.phone);
    }

    @Public()
    @Throttle({ default: { limit: AUTH_CONSTANTS.MAX_LOGIN_ATTEMPTS, ttl: AUTH_CONSTANTS.LOGIN_BLOCK_SECONDS * 1000 } })
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
    @Get('google')
    @Public()
    async googleAuth() {
    }

    @Get('google/callback')
    @Public()
    @UseGuards(GoogleAuthGuard)
    async googleAuthRedirect(
        @Request() req: any,
        @Res() res: Response,
    ) {
        try {
            const { access_token, user } = await this.authService.handleGoogleLogin(req.user);

            const frontendUrl = this.configService.get<string>('FRONTEND_URL');

            return res.redirect(`${frontendUrl}/auth/success?token=${access_token}`);

        } catch (error) {
            this.logger.error('Google auth callback failed:', error);

            const frontendUrl = this.configService.get<string>('FRONTEND_URL');
            return res.redirect(`${frontendUrl}/auth/error?message=Authentication_failed`);
        }
    }
}
