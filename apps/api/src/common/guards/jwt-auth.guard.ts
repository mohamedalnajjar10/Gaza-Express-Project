import {
    Injectable,
    ExecutionContext,
    Optional,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
    constructor(@Optional() private readonly reflector?: Reflector) {
        super();
    }

    canActivate(context: ExecutionContext) {
        const isPublic = this.reflector?.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) {
            return true;
        }
        return super.canActivate(context);
    }

    handleRequest(err: any, user: any, info: any) {
        if (info instanceof TokenExpiredError) {
            throw new UnauthorizedException({
                statusCode: 401,
                error: 'TOKEN_EXPIRED',
                message: 'Session has expired. Please login again',
            });
        }

        if (info instanceof JsonWebTokenError) {
            throw new UnauthorizedException({
                statusCode: 401,
                error: 'TOKEN_INVALID',
                message: 'Authentication token is invalid',
            });
        }

        if (info?.message === 'No auth token') {
            throw new UnauthorizedException({
                statusCode: 401,
                error: 'TOKEN_MISSING',
                message: 'You must login to access this service',
            });
        }

        if (err || !user) {
            throw new UnauthorizedException({
                statusCode: 401,
                error: 'UNAUTHORIZED',
                message: 'You are not authorized to access',
            });
        }

        return user;
    }
}