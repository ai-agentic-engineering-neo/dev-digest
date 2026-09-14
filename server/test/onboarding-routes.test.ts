import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';

/**
 * specs/10-onboarding-generator.md — routes/schemas, no-DB slice only
 * (mirrors `test/routes-smoke.test.ts`'s pattern). Both `/repos/:id/tour`
 * routes are schema-first (`IdParams` requires a uuid) — an invalid id 422s
 * from `fastify-type-provider-zod` validation before the handler (and so
 * before `container.onboardingService`, and so before any DB read) ever
 * runs, which is what makes this coverable without Docker/Postgres. The
 * DB-backed happy paths (real repo, real generation, workspace scoping) are
 * covered end-to-end in `test/onboarding.it.test.ts`.
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

describe('onboarding routes (no DB) — IdParams validation', () => {
  it('GET /repos/:id/tour with a non-uuid id 422s before the handler runs', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/repos/not-a-uuid/tour' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('POST /repos/:id/tour/generate with a non-uuid id 422s before the handler runs', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'POST', url: '/repos/not-a-uuid/tour/generate' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });
});
