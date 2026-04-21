import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../../user/user.service';
import { User } from '@prisma/client';

export interface JwtPayload {
    sub: number;
    phone: string;
    role: string;
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
        // console.log(' JWT Strategy - Payload:', payload);

        const user = await this.userService.findById(payload.sub);

        if (!user) {
            // console.error(' User not found for ID:', payload.sub);
            throw new UnauthorizedException('User not found');
        }

        if (!user.is_active) {
            // console.error('User account is inactive:', payload.sub);
            throw new UnauthorizedException('Account is disabled');
        }

        // console.log('User found:', { id: user.user_id, role: user.role });
        return user;
    }
}