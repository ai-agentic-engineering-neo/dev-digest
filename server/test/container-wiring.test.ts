import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import type { ContainerOverrides } from '../src/platform/container.js';
import type { JobRunner } from '../src/platform/jobs.js';
import { INDEX_JOB_KIND, REFRESH_JOB_KIND, RESYNC_JOB_KIND } from '../src/modules/repo-intel/constants.js';

/**
 * Composition-root characterization (SPEC-16 AC-12/AC-13, E6–E8). Only public
 * getters are used — never the private `_repoIntel` field. `makeApp()` is the
 * single factory Phase 2 may need to adapt. No DB access (postgres-js is lazy).
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

async function makeApp(overrides: ContainerOverrides = {}) {
  return buildApp({ config, overrides });
}

const fake = <T>(tag: string) => ({ tag }) as unknown as T;

describe('Container wiring', () => {
  it('overrides.repoIntel is returned as-is', async () => {
    const repoIntel = fake<NonNullable<ContainerOverrides['repoIntel']>>('repoIntel');
    const app = await makeApp({ repoIntel });
    expect(app.container.repoIntel).toBe(repoIntel);
    await app.close();
  });

  it('without override, repoIntel is lazily memoized (same instance on every read)', async () => {
    const app = await makeApp();
    const a = app.container.repoIntel;
    const b = app.container.repoIntel;
    expect(a).toBe(b);
    await app.close();
  });

  it('git / codeIndex / resolver / tokenizer overrides are returned as-is', async () => {
    const git = fake<NonNullable<ContainerOverrides['git']>>('git');
    const codeIndex = fake<NonNullable<ContainerOverrides['codeIndex']>>('codeIndex');
    const resolver = fake<NonNullable<ContainerOverrides['resolver']>>('resolver');
    const tokenizer = fake<NonNullable<ContainerOverrides['tokenizer']>>('tokenizer');
    const app = await makeApp({ git, codeIndex, resolver, tokenizer });
    expect(app.container.git).toBe(git);
    expect(app.container.codeIndex).toBe(codeIndex);
    expect(app.container.resolver).toBe(resolver);
    expect(app.container.tokenizer).toBe(tokenizer);
    await app.close();
  });

  it('reading repoIntel before git does not recurse (E6) and both stay stable', async () => {
    const app = await makeApp();
    const c = app.container;
    expect(() => c.repoIntel).not.toThrow();
    const git = c.git;
    expect(c.git).toBe(git);
    expect(c.repoIntel).toBe(c.repoIntel);
    await app.close();
  });

  it('after buildApp, the INDEX/REFRESH/RESYNC job kinds have handlers on container.jobs (AC-13)', async () => {
    const app = await makeApp();
    const handlers = (app.container.jobs as unknown as { handlers: Map<string, unknown> }).handlers;
    expect(typeof handlers.get(INDEX_JOB_KIND)).toBe('function');
    expect(typeof handlers.get(REFRESH_JOB_KIND)).toBe('function');
    expect(typeof handlers.get(RESYNC_JOB_KIND)).toBe('function');
    await app.close();
  });

  it('job handlers live on the same container.jobs instance every time', async () => {
    const app = await makeApp();
    const jobs: JobRunner = app.container.jobs;
    expect(app.container.jobs).toBe(jobs);
    await app.close();
  });
});
