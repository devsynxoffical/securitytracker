import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCodes, ApiErrorResponse, ErrorCode } from '@company-os/contracts';
import { Prisma } from '@prisma/client';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = ErrorCodes.INTERNAL_ERROR;
    let message = 'An unexpected internal server error occurred';
    let details: Record<string, unknown> | undefined = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, unknown>;
        message = (obj.message as string) || exception.message;
        code = (obj.code as ErrorCode) || this.mapStatusToErrorCode(status);
        if (obj.details) {
          details = obj.details as Record<string, unknown>;
        } else if (obj.issues) {
          details = { issues: obj.issues };
        }
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Malformed ids and missing rows are client errors, not server faults.
      if (exception.code === 'P2023') {
        status = HttpStatus.BAD_REQUEST;
        code = ErrorCodes.VALIDATION_ERROR;
        message = 'Malformed identifier';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = ErrorCodes.NOT_FOUND;
        message = 'Record not found';
      } else if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = ErrorCodes.CONFLICT;
        message = 'A record with these values already exists';
      } else {
        this.logger.error(`Database error ${exception.code}: ${exception.message}`);
        message = 'Database error';
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled Exception: ${exception.message}`, exception.stack);
      message = exception.message;
    }

    const errorResponse: ApiErrorResponse = {
      error: {
        code,
        message,
        details,
        requestId: (request.headers['x-request-id'] as string) || undefined,
      },
    };

    response.status(status).json(errorResponse);
  }

  private mapStatusToErrorCode(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCodes.VALIDATION_ERROR;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCodes.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCodes.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCodes.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCodes.CONFLICT;
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ErrorCodes.UNPROCESSABLE_ENTITY;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCodes.TOO_MANY_REQUESTS;
      default:
        return ErrorCodes.INTERNAL_ERROR;
    }
  }
}
