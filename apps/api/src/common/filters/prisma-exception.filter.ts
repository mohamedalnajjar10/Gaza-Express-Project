import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response, Request } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(GlobalExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'An internal server error occurred';

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            message = typeof exceptionResponse === 'object'
                ? (exceptionResponse as any).message || message
                : exceptionResponse as string;
        }

        else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
            this.logger.error({ event: 'prisma_error', code: exception.code, requestId: response.getHeader('X-Request-ID') });

            switch (exception.code) {
                case 'P2002': 
                    status = HttpStatus.CONFLICT;
                    message = 'Data already registered';
                    break;
                case 'P2025': 
                    status = HttpStatus.NOT_FOUND;
                    message = 'Record not found';
                    break;
                case 'P2003': 
                    status = HttpStatus.BAD_REQUEST;
                    message = 'Error in data relationships';
                    break;
                default:
                    status = HttpStatus.INTERNAL_SERVER_ERROR;
                    message = 'Database error';
            }
        }

        else if (exception instanceof Prisma.PrismaClientValidationError) {
            this.logger.warn({
                event: 'prisma_validation_error',
                requestId: response.getHeader('X-Request-ID'),
                name: exception.name,
                message: exception.message,
            });
            status = HttpStatus.BAD_REQUEST;
            message = 'Invalid request data';
        }

        else {
            const error = exception instanceof Error ? exception : undefined;
            this.logger.error({
                event: 'unexpected_http_error',
                requestId: response.getHeader('X-Request-ID'),
                method: request.method,
                path: request.path,
                name: error?.name ?? typeof exception,
                message: error?.message ?? 'Non-Error exception thrown',
                stack: error?.stack,
            });
        }

        response.status(status).json({
            success: false,
            statusCode: status,
            timestamp: new Date().toISOString(),
            path: request.path,
            message: Array.isArray(message) ? message.join(', ') : message,
        });
    }
}
