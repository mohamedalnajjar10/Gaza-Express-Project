import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../../user/user.service';
import { User } from '@prisma/client';
import { AUTH_ERROR_MESSAGES } from '../constants/auth.constants';

export interface JwtPayload {
    sub: number;
    phone: string;
    role: string;
    isActive: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private configService: ConfigService,
        private userService: UserService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get<string>('JWT_SECRET'),
        });
    }

    async validate(payload: JwtPayload): Promise<User> {
        if (!payload.isActive) {
            throw new UnauthorizedException(AUTH_ERROR_MESSAGES.ACCOUNT_DEACTIVATED);
        }
        const user = await this.userService.findById(payload.sub);
        if (!user) {
            throw new UnauthorizedException(AUTH_ERROR_MESSAGES.USER_NOT_FOUND);
        }
        if (!user.is_active) {
            throw new UnauthorizedException(AUTH_ERROR_MESSAGES.ACCOUNT_DEACTIVATED);
        }
        return user;
    }
}