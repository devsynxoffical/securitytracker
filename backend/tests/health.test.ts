import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

describe('System Monitoring Endpoints', () => {
  it('should return 200 OK at GET /health (Liveness)', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('should return 200 OK at GET /ready (Readiness & DB Check)', async () => {
    const response = await request(app).get('/ready');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready', database: 'connected' });
  });
});
