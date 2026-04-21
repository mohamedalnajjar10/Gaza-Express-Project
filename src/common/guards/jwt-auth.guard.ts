import {
    Injectable,
    ExecutionContext,
    UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {

    canActivate(context: ExecutionContext) {
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