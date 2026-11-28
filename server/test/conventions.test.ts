/**
 * M2 Conventions Extractor against in-memory ports and MockLLMProvider: one
 * model call per run, a candidate whose snippet is not in its file is dropped
 * before it is stored, accepted ones survive a re-scan, and a skill is built
 * only from accepted candidates.
 */
import { describe, it, expect } from 'vitest';
import type { Repo, Skill, SkillInput } from '@devdigest/shared';
import { ConventionsService } from '../src/modules/conventions/service.js';
import { findSnippetLines } from '../src/modules/conventions/domain.js';
import type { ConventionStore, StoredConvention, VerifiedCandidate } from '../src/modules/conventions/ports.js';
import { InMemoryScanLog } from '../src/modules/conventions/repository.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';

const FILES: Record<string, string> = {
  'src/api/users.ts': [
    "import { db } from '../db';",
    '',
    'export async function getUser(id: string) {',
    '  const user = await db.users.find(id);',
    '  return user;',
    '}',
  ].join('\n'),
  'src/lib/redis.ts': "export const redis = new Redis(config.redisUrl);\n",
  'package.json': '{ "name": "payments-api" }',
};

const EXTRACTION = {
  candidates: [
    {
      category: 'Async',
      rule: 'Use async/await instead of .then() chains',
      evidence_path: 'src/api/users.ts',
      evidence_snippet: '    const user = await db.users.find(id);\n  return user;',
      confidence: 0.9,
    },
    {
      category: 'structure',
      rule: 'Redis access goes through src/lib/redis.ts',
      evidence_path: 'src/lib/redis.ts',
      evidence_snippet: 'export const redis = new Redis(config.redisUrl);',
      confidence: 0.8,
    },
    {
      category: 'errors',
      rule: 'Handlers return Result<T, ApiError>',
      evidence_path: 'src/api/users.ts',
      evidence_snippet: 'return ok(items);',
      confidence: 0.7,
    },
  ],
};

const repo = { id: 'repo-1', full_name: 'acme/payments-api', clone_path: '/clones/acme/payments-api' } as Repo;

class MemoryStore implements ConventionStore {
  rows: StoredConvention[] = [];
  private seq = 0;
  async listByRepo(_ws: string, repoId: string) {
    return this.rows.filter((r) => r.repoId === repoId);
  }
  async getById(_ws: string, id: string) {
    return this.rows.find((r) => r.id === id);
  }
  async replaceUndecided(_ws: string, repoId: string, fresh: VerifiedCandidate[]) {
    this.rows = this.rows.filter((r) => r.repoId !== repoId || r.status === 'accepted');
    for (const c of fresh) {
      this.rows.push({ ...c, id: `00000000-0000-4000-8000-00000000000${++this.seq}`, repoId, status: 'pending', createdAt: new Date() });
    }
  }
  async update(_ws: string, id: string, patch: Partial<StoredConvention>) {
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, patch);
    return row;
  }
}

function setup() {
  const store = new MemoryStore();
  const llm = new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: EXTRACTION } });
  const saved: { input: SkillInput; evidence: string[] }[] = [];
  const service = new ConventionsService({
    store,
    repos: { getById: async (_ws, id) => (id === repo.id ? repo : undefined) },
    samples: async () => ['src/api/users.ts', 'src/lib/redis.ts'],
    readFile: async (_clone, file) => FILES[file] ?? null,
    llm: async () => llm,
    model: async () => ({ provider: 'openai', model: 'cheap-model' }),
    writeSkill: async (_ws, input, evidence) => {
      saved.push({ input, evidence });
      return { id: 'skill-1', ...input } as Skill;
    },
    scans: new InMemoryScanLog(),
  });
  return { service, store, llm, saved };
}

describe('findSnippetLines', () => {
  it('finds a re-indented snippet and returns its 1-based lines', () => {
    expect(findSnippetLines(FILES['src/api/users.ts']!, 'const user = await db.users.find(id);\n    return user;')).toEqual({
      startLine: 4,
      endLine: 5,
    });
  });

  it('returns null for a snippet that is not in the file', () => {
    expect(findSnippetLines(FILES['src/api/users.ts']!, 'return ok(items);')).toBeNull();
  });
});

describe('ConventionsService', () => {
  it('calls the model once and stores only candidates with real evidence', async () => {
    const { service, llm } = setup();
    const result = await service.extract('ws', repo.id);

    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    expect(result.candidates.map((c) => c.rule)).toEqual([
      'Use async/await instead of .then() chains',
      'Redis access goes through src/lib/redis.ts',
    ]);
    expect(result.candidates[0]).toMatchObject({ evidence_start_line: 4, evidence_end_line: 5, category: 'async', status: 'pending' });
    expect(result.sample_count).toBe(3); // package.json + 2 ranked samples
  });

  it('keeps accepted candidates on re-scan without duplicating them', async () => {
    const { service } = setup();
    const first = await service.extract('ws', repo.id);
    await service.patch('ws', repo.id, first.candidates[0]!.id, { status: 'accepted' });
    await service.patch('ws', repo.id, first.candidates[1]!.id, { status: 'rejected' });

    const second = await service.extract('ws', repo.id);
    const rules = second.candidates.map((c) => c.rule);
    expect(rules.filter((r) => r.startsWith('Use async/await'))).toHaveLength(1);
    expect(second.candidates.find((c) => c.rule.startsWith('Use async/await'))?.status).toBe('accepted');
  });

  it('builds a skill from accepted candidates only', async () => {
    const { service, saved } = setup();
    const { candidates } = await service.extract('ws', repo.id);
    const [accepted, rejected] = candidates;
    await service.patch('ws', repo.id, accepted!.id, { status: 'accepted' });
    await service.patch('ws', repo.id, rejected!.id, { status: 'rejected' });
    const draft = { name: 'repo-conventions', description: '1 house convention', body: '# repo-conventions' };

    await expect(
      service.createSkill('ws', repo.id, { ...draft, convention_ids: [accepted!.id, rejected!.id] }),
    ).rejects.toThrow(/accepted/);

    await service.createSkill('ws', repo.id, { ...draft, convention_ids: [accepted!.id] });
    expect(saved).toEqual([
      { input: { ...draft, type: 'convention' }, evidence: ['src/api/users.ts'] },
    ]);
  });
});
