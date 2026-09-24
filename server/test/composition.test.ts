import { describe, it, expect, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { Container } from '../src/platform/container.js';
import type { Db } from '../src/db/client.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import { CLONE_JOB_KIND } from '../src/modules/repos/constants.js';
import { INDEX_JOB_KIND, REFRESH_JOB_KIND, RESYNC_JOB_KIND } from '../src/modules/repo-intel/constants.js';
import { EXTRACT_JOB_KIND } from '../src/modules/conventions/domain/constants.js';

/** Composition root: one lazily-built service set per container, jobs registered once, graceful close. */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const fakeDb = {} as Db;

describe('Container composition root', () => {
  it('builds each module once, lazily, from its own factory', () => {
    const c = new Container(config, fakeDb);
    expect(c.modules.agents.service).toBe(c.modules.agents.service);
    expect(c.modules.reviews.service).toBe(c.modules.reviews.service);
    expect(c.repoIntel).toBe(c.modules.repoIntel.service);
    expect(Object.keys(c.modules).sort()).toEqual([
      'agents',
      'conventions',
      'intent',
      'polling',
      'pulls',
      'repoIntel',
      'repos',
      'reviews',
      'settings',
      'skills',
      'workspace',
    ]);
  });

  it('ContainerOverrides.repoIntel swaps only the read facade', () => {
    const fake = {} as RepoIntel;
    const c = new Container(config, fakeDb, { repoIntel: fake });
    expect(c.repoIntel).toBe(fake);
    expect(c.modules.repoIntel.service).not.toBe(fake);
  });

  it('registers every module job handler exactly once', () => {
    const c = new Container(config, fakeDb);
    const register = vi.spyOn(c.jobs, 'register');
    c.registerJobHandlers();
    const kinds = register.mock.calls.map(([kind]) => kind).sort();
    expect(kinds).toEqual([CLONE_JOB_KIND, INDEX_JOB_KIND, REFRESH_JOB_KIND, RESYNC_JOB_KIND, EXTRACT_JOB_KIND].sort());
  });
});

describe('Container.github() logger', () => {
  it('passes the injected app logger to OctokitGitHubClient (not console)', async () => {
    const log = { warn: vi.fn() };
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const secrets = { get: async () => 'test-token' };
    const c = new Container(config, fakeDb, { secrets }, log);
    const gh = await c.github();
    // Stub Octokit so getPullRequest sees 5 changed files but fetches none → capped warning.
    const pulls = {
      get: async () => ({
        data: {
          number: 7, title: 't', user: { login: 'u' }, head: { ref: 'h', sha: 'abc' },
          base: { ref: 'main' }, additions: 0, deletions: 0, changed_files: 5, state: 'open',
          merged_at: null, created_at: null, updated_at: null, body: null,
        },
      }),
      listFiles: async () => ({ data: [] }),
      listCommits: async () => ({ data: [] }),
    };
    (gh as unknown as { octokit: { rest: { pulls: unknown } } }).octokit = { rest: { pulls } };
    await gh.getPullRequest({ owner: 'o', name: 'r' }, 7);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(consoleWarn).not.toHaveBeenCalled();
    consoleWarn.mockRestore();
  });
});

describe('graceful close', () => {
  it('app.close() cancels live runs and ends their SSE subscribers', async () => {
    const app = await buildApp({ config });
    const bus = app.container.runBus;
    bus.publish('run-1', 'info', 'working');
    const cancelled = vi.fn(() => queueMicrotask(() => bus.complete('run-1')));
    bus.onCancel('run-1', cancelled);
    bus.subscribe('run-orphan', () => undefined); // an SSE subscriber with no runner
    const ended = vi.fn();
    bus.onDone('run-orphan', ended);

    vi.spyOn(app.container.runBus, 'whenIdle').mockResolvedValueOnce(false); // don't wait 5s for the orphan
    await app.close();

    expect(cancelled).toHaveBeenCalledOnce();
    expect(ended).toHaveBeenCalledOnce();
    expect(bus.liveRunIds()).toEqual([]);
  });
});
