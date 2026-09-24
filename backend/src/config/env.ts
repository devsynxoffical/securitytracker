import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0 && val < 65536, {
      message: 'PORT must be a valid port number between 1 and 65535',
    })
    .default('4000'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, { message: 'DATABASE_URL environment variable is required' }),
  JWT_SECRET: z.string().min(16, { message: 'JWT_SECRET must be at least 16 characters' }).default('devsynx_activity_tracker_jwt_secret_key_prod_2026'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_ALLOWED_DOMAIN: z.string().default('devsynx.com'),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ FATAL: Invalid Environment Configuration:');
    result.error.issues.forEach((issue) => {
      console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
    });
    throw new Error('Environment configuration validation failed. Server startup aborted.');
  }

  return result.data;
}

export const config = loadConfig();
export type Config = typeof config;
