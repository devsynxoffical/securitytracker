import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import app from '../src/app.js';
import { z } from 'zod';
import { validateRequest } from '../src/middleware/validate.middleware.js';
import { errorHandler } from '../src/middleware/error.middleware.js';

describe('Backend Foundation Tests', () => {
  describe('GET /health (Liveness Check)', () => {
    it('should return 200 OK with status ok', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('GET /ready (Readiness Check)', () => {
    it('should return 200 OK with database status connected', async () => {
      const response = await request(app).get('/ready');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ready', database: 'connected' });
    });
  });

  describe('Invalid Route Handling (404)', () => {
    it('should return 404 formatted JSON error for non-existent routes', async () => {
      const response = await request(app).get('/api/v1/non-existent-route');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toContain('The requested endpoint does not exist');
    });
  });

  describe('Request Validation Middleware (Zod)', () => {
    const testApp = express();
    testApp.use(express.json());

    const testSchema = {
      body: z.object({
        email: z.string().email(),
        age: z.number().min(18),
      }),
    };

    testApp.post('/test-validate', validateRequest(testSchema), (_req, res) => {
      res.status(200).json({ status: 'success' });
    });
    testApp.use(errorHandler);

    it('should reject invalid requests with 400 VALIDATION_ERROR', async () => {
      const response = await request(testApp)
        .post('/test-validate')
        .send({ email: 'invalid-email', age: 15 });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toBeInstanceOf(Array);
      expect(response.body.error.details.length).toBeGreaterThan(0);
    });

    it('should accept valid requests with 200 OK', async () => {
      const response = await request(testApp)
        .post('/test-validate')
        .send({ email: 'john@example.com', age: 25 });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });
  });
});
