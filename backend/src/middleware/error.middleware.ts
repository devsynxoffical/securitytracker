import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/api-error.js';
import { config } from '../config/env.js';

export function errorHandler(
  err: Error | ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected internal server error occurred';
  let details: unknown | null = null;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err.name === 'SyntaxError') {
    statusCode = 400;
    code = 'MALFORMED_JSON';
    message = 'Invalid JSON body syntax';
  } else {
    // Log unexpected internal errors in development / diagnostic output
    console.error('[Unhandled Exception]:', err);
  }

  const errorResponseBody: {
    error: {
      code: string;
      message: string;
      details?: unknown;
      stack?: string;
    };
  } = {
    error: {
      code,
      message,
      ...(details !== null && details !== undefined && { details }),
      ...(config.NODE_ENV === 'development' && { stack: err.stack }),
    },
  };

  res.status(statusCode).json(errorResponseBody);
}
