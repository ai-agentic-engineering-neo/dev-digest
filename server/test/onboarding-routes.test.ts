/**
 * onboarding: route smoke test without a database. `reposRepo` is not
 * overridable, so only the edge (route schema) is covered here; 404, 422 (no
 * clone), 202 and the GET view run against Postgres in onboarding.it.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider, MockGitClient } from '../src/adapters/mocks.js';
import { FakeOnboardingRepo } from './helpers/onboarding.js';

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

describe('onboarding routes (no DB)', () => {
  it('both routes are registered and validate :id at the edge (422 envelope, no run created)', async () => {
    const repo = new FakeOnboardingRepo();
    const app = await buildApp({
      config,
      overrides: { auth: new MockAuthProvider(), onboardingRepo: repo, git: new MockGitClient() },
    });
    const get = await app.inject({ method: 'GET', url: '/repos/not-a-uuid/onboarding' });
    expect(get.statusCode).toBe(422);
    const post = await app.inject({ method: 'POST', url: '/repos/not-a-uuid/onboarding/generate' });
    expect(post.statusCode).toBe(422);
    expect(post.json().error).toBeTruthy();
    expect(repo.runs).toHaveLength(0);
    await app.close();
  });
});
