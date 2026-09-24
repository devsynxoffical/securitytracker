import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config/env.js';
import { requestLogger } from './middleware/logger.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';
import { apiRateLimiter } from './middleware/rate-limit.middleware.js';
import { ApiError } from './utils/api-error.js';
import router from './routes/index.js';

export function createApp(): Express {
  const app = express();

  // Security HTTP Headers
  app.use(helmet());

  // CORS Configuration
  app.use(
    cors({
      origin: config.CORS_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Token', 'X-Device-ID'],
    })
  );

  // Rate Limiting
  app.use('/api/', apiRateLimiter);

  // Body Parsers
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Request Timing & Logging
  app.use(requestLogger);

  // Mount Application Routes (/health, /ready, /api/v1/...)
  app.use('/', router);

  // 404 Handler for undefined routes
  app.use((_req, _res, next) => {
    next(ApiError.notFound('The requested endpoint does not exist'));
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}

const app = createApp();
export default app;
