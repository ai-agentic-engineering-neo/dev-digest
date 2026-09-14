import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConventionsService } from '../src/modules/conventions/service.js';
import { getConventionsSampleSet } from '../src/modules/conventions/samples.js';
import type {
  ConventionRow,
  ConventionScanRow,
  InsertCandidate,
  InsertScan,
} from '../src/modules/conventions/repository.js';
import { ValidationError } from '../src/platform/errors.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';

/**
 * Hermetic service test (no DB, no network) — an in-memory fake repository
 * stands in for Postgres so `extract`/`createSkillFromConventions` exercise
 * real persistence LOGIC (status transitions, "only accepted" enforcement)
 * without a testcontainer.
 */
class FakeConventionsRepository {
  scans: ConventionScanRow[] = [];
  rows: ConventionRow[] = [];
  private seq = 0;

  async insertScan(v: InsertScan): Promise<ConventionScanRow> {
    const row = {
      id: `scan-${++this.seq}`,
      workspaceId: v.workspaceId,
      repoId: v.repoId,
      sampleFileCount: v.sampleFileCount,
      sourceSha: v.sourceSha,
      model: v.model,
      createdAt: new Date(),
    } as ConventionScanRow;
    this.scans.push(row);
    return row;
  }

  async insertCandidates(values: InsertCandidate[]): Promise<ConventionRow[]> {
    const rows = values.map((v) => ({
      id: `conv-${++this.seq}`,
      workspaceId: v.workspaceId,
      repoId: v.repoId,
      scanId: v.scanId,
      category: v.category,
      rule: v.rule,
      evidencePath: v.evidencePath,
      evidenceStartLine: v.evidenceStartLine,
      evidenceEndLine: v.evidenceEndLine,
      evidenceSnippet: v.evidenceSnippet,
      confidence: v.confidence,
      status: 'pending' as const,
    })) as ConventionRow[];
    this.rows.push(...rows);
    return rows;
  }

  async getLatestScan(workspaceId: string, repoId: string) {
    return this.scans
      .filter((s) => s.workspaceId === workspaceId && s.repoId === repoId)
      .at(-1);
  }

  async listByScan(scanId: string) {
    return this.rows.filter((r) => r.scanId === scanId);
  }

  async getById(workspaceId: string, id: string) {
    return this.rows.find((r) => r.workspaceId === workspaceId && r.id === id);
  }

  async getByIds(workspaceId: string, ids: string[]) {
    return this.rows.filter((r) => r.workspaceId === workspaceId && ids.includes(r.id));
  }

  async setStatus(workspaceId: string, id: string, status: ConventionRow['status']) {
    const row = this.rows.find((r) => r.workspaceId === workspaceId && r.id === id);
    if (!row) return undefined;
    row.status = status;
    return row;
  }
}

async function withClone(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'devdigest-conv-svc-'));
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content);
  }
  return dir;
}

describe('ConventionsService.extract', () => {
  it('persists only candidates whose evidence is verified against the clone', async () => {
    const clonePath = await withClone({ 'src/foo.ts': 'export const foo = 1;' });
    try {
      const llm = new MockLLMProvider('openai', {
        structuredBySchema: {
          ConventionExtraction: {
            candidates: [
              {
                category: 'exports',
                rule: 'Export constants with `export const`.',
                evidence_path: 'src/foo.ts',
                evidence_snippet: 'export const foo = 1;',
                confidence: 0.9,
              },
              {
                category: 'hallucinated',
                rule: 'This rule cites code that is not actually there.',
                evidence_path: 'src/foo.ts',
                evidence_snippet: 'const bogus = "never in this file";',
                confidence: 0.5,
              },
              {
                category: 'missing-file',
                rule: 'This rule cites a file that was never sampled or cloned.',
                evidence_path: 'src/does-not-exist.ts',
                evidence_snippet: 'anything',
                confidence: 0.5,
              },
            ],
          },
        },
      });

      // Fakes only `getConventionsSampleSet`'s own dependencies (repoIntel, git)
      // — same code path as production, minus the container.
      const fakeContainer = {
        repoIntel: { getConventionSamples: async () => ['src/foo.ts'] },
        git: { currentHead: async () => 'sha-abc' },
      } as unknown as Parameters<typeof getConventionsSampleSet>[0];

      const repos = {
        getById: async () => ({ id: 'repo-1', owner: 'acme', name: 'demo', clonePath }),
      };

      const repo = new FakeConventionsRepository();
      const service = new ConventionsService(
        repo as never,
        repos,
        {} as never, // skills — unused by extract()
        (r) => getConventionsSampleSet(fakeContainer, r),
        async () => ({ provider: 'openai', model: 'gpt-x' }),
        async () => llm,
      );

      const result = await service.extract('ws-1', 'repo-1');

      expect(result.scan).not.toBeNull();
      expect(result.scan!.source_sha).toBe('sha-abc');
      // Only the verified candidate survives — the hallucinated snippet and
      // the nonexistent file are both dropped, never persisted.
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]!.category).toBe('exports');
      expect(result.candidates[0]!.evidence_start_line).toBe(1);
      expect(result.candidates[0]!.status).toBe('pending');
    } finally {
      await rm(clonePath, { recursive: true, force: true });
    }
  });
});

describe('ConventionsService.createSkillFromConventions', () => {
  function serviceWithRows(rows: Partial<ConventionRow>[]) {
    const repo = new FakeConventionsRepository();
    repo.rows = rows as ConventionRow[];
    const created: unknown[] = [];
    const skills = {
      create: async (_ws: string, input: unknown) => {
        created.push(input);
        return { id: 'skill-1', ...(input as object) };
      },
    };
    const service = new ConventionsService(
      repo as never,
      {} as never,
      skills,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, created };
  }

  const ACCEPTED: Partial<ConventionRow> = {
    id: 'conv-1',
    workspaceId: 'ws-1',
    category: 'async',
    rule: 'Always use async/await.',
    evidencePath: 'src/foo.ts',
    evidenceStartLine: 3,
    evidenceEndLine: 3,
    evidenceSnippet: 'await foo();',
    confidence: 0.9,
    status: 'accepted',
  };

  it('merges only accepted candidates into the skill body and evidence_files', async () => {
    const { service, created } = serviceWithRows([ACCEPTED]);
    const skill = await service.createSkillFromConventions('ws-1', {
      conventionIds: ['conv-1'],
      name: 'repo-conventions',
      description: '1 house convention extracted from this repo',
      enabled: false,
    });
    expect(skill.id).toBe('skill-1');
    expect(created).toHaveLength(1);
    const input = created[0] as { body: string; evidenceFiles: string[]; type: string; source: string };
    expect(input.type).toBe('convention');
    expect(input.source).toBe('extracted');
    expect(input.body).toContain('Always use async/await.');
    expect(input.evidenceFiles).toEqual(['src/foo.ts:3-3']);
  });

  it('rejects the request server-side if any candidate is not accepted', async () => {
    const { service } = serviceWithRows([ACCEPTED, { ...ACCEPTED, id: 'conv-2', status: 'pending' }]);
    await expect(
      service.createSkillFromConventions('ws-1', {
        conventionIds: ['conv-1', 'conv-2'],
        name: 'repo-conventions',
        description: 'x',
        enabled: false,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects when a convention id does not exist in this workspace', async () => {
    const { service } = serviceWithRows([ACCEPTED]);
    await expect(
      service.createSkillFromConventions('ws-1', {
        conventionIds: ['conv-1', 'does-not-exist'],
        name: 'repo-conventions',
        description: 'x',
        enabled: false,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
