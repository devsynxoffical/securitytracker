import rateLimit from 'express-rate-limit';
import { ApiError } from '../utils/api-error.js';

// General API Rate Limiter: 100 requests per 15 minutes per IP
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(ApiError.tooManyRequests('Too many requests from this IP, please try again after 15 minutes'));
  },
});

// Telemetry Ingestion Rate Limiter: 60 requests per minute per IP (allowing agent 60s batching with burst room)
export const telemetryRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(ApiError.tooManyRequests('Telemetry upload rate limit exceeded'));
  },
});
