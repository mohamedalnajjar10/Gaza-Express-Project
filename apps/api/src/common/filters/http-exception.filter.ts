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
        let error = 'INTERNAL_SERVER_ERROR';

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const exceptionResponse = exception.getResponse();

            if (typeof exceptionResponse === 'object') {
                const res = exceptionResponse as any;
                message = res.message || message;
                error = res.error || error;
            } else {
                message = exceptionResponse as string;
            }
        }

        else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
            this.logger.error(`Prisma Error: ${exception.code}`, exception.stack);

            switch (exception.code) {
                case 'P2002':
                    status = HttpStatus.CONFLICT;
                    error = 'DUPLICATE_ENTRY';
                    const target = (exception.meta?.target as string[]) || [];
                    if (target.includes('phone')) {
                        message = 'Phone number already registered';
                    } else if (target.includes('email')) {
                        message = 'Email already registered';
                    } else {
                        message = 'Data already registered';
                    }
                    break;

                case 'P2025':
                    status = HttpStatus.NOT_FOUND;
                    error = 'NOT_FOUND';
                    message = 'Record not found';
                    break;

                case 'P2003':
                    status = HttpStatus.BAD_REQUEST;
                    error = 'FOREIGN_KEY_ERROR';
                    message = 'Error in data relationships';
                    break;

                default:
                    status = HttpStatus.INTERNAL_SERVER_ERROR;
                    error = 'DATABASE_ERROR';
                    message = 'Database error';
            }
        }

        else {
            this.logger.error(
                'Unexpected error:',
                exception instanceof Error ? exception.stack : exception,
            );
        }

        response.status(status).json({
            success: false,
            statusCode: status,
            error,
            timestamp: new Date().toISOString(),
            path: request.url,
            message: Array.isArray(message) ? message.join(', ') : message,
        });
    }
}