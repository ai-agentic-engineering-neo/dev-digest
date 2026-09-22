import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Convention, ConventionScan, Skill } from '@devdigest/shared';
import { cloneFiles } from '../src/modules/conventions/infrastructure/clone-files.js';
import { ConventionsService } from '../src/modules/conventions/application/conventions-service.js';
import type {
  ConventionModel,
  ConventionsStore,
  ProposalResult,
} from '../src/modules/conventions/application/ports.js';
import type { KeptConvention, ScanSummary } from '../src/modules/conventions/domain/types.js';
import { ConflictError } from '../src/platform/errors.js';

let root: string;
let outside: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'conv-clone-'));
  outside = await mkdtemp(join(tmpdir(), 'conv-outside-'));
  await writeFile(join(outside, 'secret.txt'), 'TOP SECRET');
  await mkdir(join(root, 'src/api'), { recursive: true });
  await mkdir(join(root, 'node_modules/dep'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{ "name": "demo" }\n');
  await writeFile(join(root, 'src/api/users.ts'), 'export async function getUser(id: string) {\n  return await db.users.find(id);\n}\n');
  await writeFile(join(root, 'src/api/users.test.ts'), 'test()\n');
  await writeFile(join(root, 'node_modules/dep/index.js'), 'module.exports = 1\n');
  await symlink(join(outside, 'secret.txt'), join(root, 'src/leak.ts'));
  await symlink(outside, join(root, 'src/outdir'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

describe('cloneFiles (confined reader)', () => {
  it('lists regular files, skipping dependency dirs and symlinks', async () => {
    const files = await cloneFiles.list(root);
    expect(files.sort()).toEqual(['package.json', 'src/api/users.test.ts', 'src/api/users.ts']);
  });

  it('reads files inside the clone only', async () => {
    expect(await cloneFiles.read(root, 'src/api/users.ts')).toContain('getUser');
    expect(await cloneFiles.read(root, `../${outside.split('/').pop()}/secret.txt`)).toBeNull();
    expect(await cloneFiles.read(root, join(outside, 'secret.txt'))).toBeNull();
    expect(await cloneFiles.read(root, 'src/leak.ts')).toBeNull();
    expect(await cloneFiles.read(root, 'src/outdir/secret.txt')).toBeNull();
    expect(await cloneFiles.read(root, 'src/missing.ts')).toBeNull();
    expect(await cloneFiles.read(root, 'src')).toBeNull();
  });
});

// ---- ConventionsService with in-memory fakes --------------------------------------

function makeStore() {
  const scans: ConventionScan[] = [];
  let conventions: Convention[] = [];
  let seq = 0;
  const completed: { kept: KeptConvention[]; summary: ScanSummary }[] = [];
  const failed: { id: string; error: string }[] = [];
  const store: ConventionsStore = {
    latestScan: async () => scans.at(-1),
    list: async () => conventions,
    find: async (_ws, id) => conventions.find((c) => c.id === id),
    failStaleScans: async () => {},
    startScan: async (_ws, repoId) => {
      if (scans.some((s) => s.status === 'running')) throw new ConflictError('running', undefined, 'scan_running');
      const scan: ConventionScan = {
        id: `scan-${++seq}`,
        repo_id: repoId,
        status: 'running',
        sampled_files: [],
        proposed: 0,
        kept: 0,
        dropped: [],
        started_at: new Date().toISOString(),
      };
      scans.push(scan);
      return scan;
    },
    failScan: async (id, error) => {
      failed.push({ id, error });
    },
    completeScan: async (_scan, kept, summary) => {
      completed.push({ kept, summary });
    },
    update: async (_ws, id, patch) => {
      conventions = conventions.map((c) => (c.id === id ? { ...c, ...patch } : c));
      return conventions.find((c) => c.id === id);
    },
    setSkill: async (_repo, ids, skillId) => {
      conventions = conventions.map((c) => (ids.includes(c.id) ? { ...c, skill_id: skillId } : c));
    },
  };
  return {
    store,
    completed,
    failed,
    seed: (cs: Partial<Convention>[]) => {
      conventions = cs.map((c, i) => ({
        id: `c${i + 1}`,
        repo_id: 'repo-1',
        category: 'other',
        rule: `rule ${i + 1}`,
        evidence: [],
        confidence: 0.8,
        status: 'pending',
        edited: false,
        created_at: '',
        updated_at: '',
        ...c,
      }));
    },
  };
}

function makeService(opts: { model?: ConventionModel; ranked?: string[]; clonePath?: string | null } = {}) {
  const s = makeStore();
  const enqueue = vi.fn(async () => {});
  const createExtracted = vi.fn(async (_ws: string, _repo: string, input: { name: string }) => ({ id: 'skill-1', name: input.name }) as Skill);
  const linkSkill = vi.fn(async () => []);
  const propose = vi.fn<ConventionModel['propose']>(
    opts.model?.propose ??
      (async (): Promise<ProposalResult> => ({
        data: {
          candidates: [
            {
              category: 'async',
              rule: 'Handlers use async/await',
              confidence: 0.9,
              // wrong lines on purpose → relocated to line 2
              evidence: [{ path: 'src/api/users.ts', start_line: 9, end_line: 9, snippet: 'return await db.users.find(id);' }],
            },
            {
              category: 'other',
              rule: 'Leaks a secret',
              confidence: 0.9,
              evidence: [{ path: 'src/leak.ts', start_line: 1, end_line: 1, snippet: 'TOP SECRET' }],
            },
          ],
        },
        model: 'mock-model',
        tokensIn: 10,
        tokensOut: 5,
        costUsd: 0.001,
      })),
  );
  const service = new ConventionsService({
    store: s.store,
    repos: {
      get: async (_ws, id) =>
        id === 'repo-1' ? { id, fullName: 'acme/demo', name: 'demo', clonePath: opts.clonePath === undefined ? root : opts.clonePath } : undefined,
    },
    files: cloneFiles,
    ranker: { getConventionSamples: async () => opts.ranked ?? [] },
    model: { propose },
    queue: { enqueue },
    skills: { createExtracted },
    agents: {
      get: async (_ws, id) => (id === 'agent-1' ? { id, name: 'General Reviewer', enabled: true } : undefined),
      linkSkill,
    },
    clock: () => new Date(),
  });
  return { service, ...s, enqueue, propose, createExtracted, linkSkill };
}

describe('ConventionsService', () => {
  it('extract starts a scan, enqueues it, and refuses a second one', async () => {
    const { service, enqueue } = makeService();
    const scan = await service.extract('ws', 'repo-1');
    expect(scan.status).toBe('running');
    expect(enqueue).toHaveBeenCalledWith({ scanId: scan.id, workspaceId: 'ws', repoId: 'repo-1' });
    await expect(service.extract('ws', 'repo-1')).rejects.toMatchObject({ code: 'scan_running' });
  });

  it('extract: unknown repo → 404, repo without clone → 422 not_cloned', async () => {
    await expect(makeService().service.extract('ws', 'nope')).rejects.toMatchObject({ kind: 'not_found' });
    await expect(makeService({ clonePath: null }).service.extract('ws', 'repo-1')).rejects.toMatchObject({
      code: 'not_cloned',
    });
  });

  it('runScan samples configs + fallback sources, verifies evidence, never reads outside the clone', async () => {
    const { service, completed, failed, propose } = makeService();
    await service.runScan({ scanId: 'scan-1', workspaceId: 'ws', repoId: 'repo-1' }, new AbortController().signal);
    expect(failed).toEqual([]);
    const user = propose.mock.calls[0]![1][1]!.content;
    expect(user).toContain('=== FILE: package.json (config) ===');
    expect(user).toContain('=== FILE: src/api/users.ts (source) ===');
    expect(user).not.toContain('users.test.ts');
    expect(user).not.toContain('TOP SECRET');

    const [{ kept, summary }] = completed as [(typeof completed)[number]];
    expect(kept).toEqual([
      expect.objectContaining({
        rule: 'Handlers use async/await',
        evidence: [{ path: 'src/api/users.ts', start_line: 2, end_line: 2, snippet: 'return await db.users.find(id);' }],
      }),
    ]);
    expect(summary).toMatchObject({
      proposed: 2,
      kept: 1,
      dropped: [{ rule: 'Leaks a secret', path: 'src/leak.ts', reason: 'file_not_found' }],
      model: 'mock-model',
      costUsd: 0.001,
      sampledFiles: ['package.json', 'src/api/users.ts'],
    });
  });

  it('runScan prefers the repo-intel ranking when it has files', async () => {
    const { service, propose } = makeService({ ranked: ['src/api/users.ts', 'gone.ts'] });
    await service.runScan({ scanId: 's', workspaceId: 'ws', repoId: 'repo-1' }, new AbortController().signal);
    expect(propose.mock.calls[0]![1][1]!.content).toContain('src/api/users.ts (source)');
  });

  it('runScan records a model failure on the scan and does not throw', async () => {
    const { service, failed, completed } = makeService({
      model: {
        propose: async () => {
          throw new Error('OPENAI_API_KEY is not configured');
        },
      },
    });
    await expect(
      service.runScan({ scanId: 'scan-9', workspaceId: 'ws', repoId: 'repo-1' }, new AbortController().signal),
    ).resolves.toBeUndefined();
    expect(failed).toEqual([{ id: 'scan-9', error: 'OPENAI_API_KEY is not configured' }]);
    expect(completed).toEqual([]);
  });

  it('runScan skips rules the repo already decided on', async () => {
    const { service, completed, seed } = makeService();
    seed([{ rule: 'handlers use ASYNC/AWAIT', status: 'rejected' }]);
    await service.runScan({ scanId: 's', workspaceId: 'ws', repoId: 'repo-1' }, new AbortController().signal);
    expect(completed[0]!.kept).toEqual([]);
    expect(completed[0]!.summary.dropped.map((d) => d.reason)).toEqual(['duplicate', 'file_not_found']);
  });

  it('update marks a text change as edited, a status change not', async () => {
    const { service, seed } = makeService();
    seed([{}]);
    expect((await service.update('ws', 'c1', { status: 'accepted' })).edited).toBe(false);
    expect((await service.update('ws', 'c1', { rule: 'New text' })).edited).toBe(true);
    await expect(service.update('ws', 'zzz', { status: 'rejected' })).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('createSkill merges accepted rules, links agents, and points the rules at the skill', async () => {
    const { service, seed, createExtracted, linkSkill, store } = makeService();
    seed([{ status: 'accepted' }, { status: 'accepted' }, { status: 'pending' }]);
    const input = { convention_ids: ['c1', 'c2'], name: 'demo-conventions', body: '# demo', agent_ids: ['agent-1'] };

    await expect(service.createSkill('ws', 'repo-1', { ...input, convention_ids: ['c1', 'c3'] })).rejects.toMatchObject({
      kind: 'validation',
    });
    await expect(service.createSkill('ws', 'repo-1', { ...input, agent_ids: ['agent-x'] })).rejects.toMatchObject({
      code: 'unknown_agent',
    });
    expect(createExtracted).not.toHaveBeenCalled();

    const res = await service.createSkill('ws', 'repo-1', input);
    expect(createExtracted).toHaveBeenCalledWith('ws', 'acme/demo', {
      name: 'demo-conventions',
      description: undefined,
      type: 'convention',
      body: '# demo',
      enabled: true,
    });
    expect(linkSkill).toHaveBeenCalledWith('ws', 'agent-1', 'skill-1');
    expect(res.linked_agents).toEqual([{ id: 'agent-1', name: 'General Reviewer', enabled: true }]);
    expect((await store.list('repo-1')).map((c) => c.skill_id ?? null)).toEqual(['skill-1', 'skill-1', null]);
  });
});
