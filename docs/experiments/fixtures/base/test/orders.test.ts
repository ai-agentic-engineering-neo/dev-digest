import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';

describe('GET /v1/orders/:id', () => {
  it('returns the order', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/orders/1001' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: '1001', total: 4200, currency: 'EUR' });
  });
});
