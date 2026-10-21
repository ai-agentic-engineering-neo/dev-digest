/** smart-diff: route smoke test without a database (fake repository port). */
import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import type { SmartDiffRepositoryPort } from '../src/modules/smart-diff/ports.js';

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const PR = '11111111-1111-4111-8111-111111111111';
const fake: SmartDiffRepositoryPort = {
  getInputs: async (_w, id) =>
    id === PR
      ? {
          hasReview: true,
          files: [
            { path: 'src/a.ts', additions: 3, deletions: 1 },
            { path: 'package-lock.json', additions: 9, deletions: 9 },
          ],
          findings: [{ id: 'f1', file: 'src/a.ts', startLine: 4, dismissed: false }],
        }
      : undefined,
};
const makeApp = () => buildApp({ config, overrides: { auth: new MockAuthProvider(), smartDiffRepo: fake } });

describe('smart-diff routes (no DB)', () => {
  it('GET /pulls/:id/smart-diff returns a body that parses as SmartDiff', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/pulls/${PR}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = SmartDiff.parse(res.json());
    expect(body.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    expect(body.groups[0]!.files[0]!.finding_lines).toEqual([4]);
    expect(body.groups[4]!.files[0]!.path).toBe('package-lock.json');
    await app.close();
  });

  it('unknown PR gives a 404 envelope; a bad id gives 422', async () => {
    const app = await makeApp();
    const missing = await app.inject({ method: 'GET', url: '/pulls/22222222-2222-4222-8222-222222222222/smart-diff' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBeDefined();
    const bad = await app.inject({ method: 'GET', url: '/pulls/nope/smart-diff' });
    expect(bad.statusCode).toBe(422);
    await app.close();
  });
});
