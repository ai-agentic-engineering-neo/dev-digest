/**
 * GET /pulls/:id/smart-diff (server/specs/06-smart-diff.md). Groups the PR's
 * files by role and attaches the finding lines of each agent's newest review — no model
 * call, so a MockLLMProvider whose `.calls` stays empty proves it
 * (server/INSIGHTS.md: overrides.llm covers every provider id used).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { SmartDiffResponse } from '@devdigest/shared';
import { SmartDiffResponse as SmartDiffResponseSchema } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () =>
  loadConfig({ ...process.env, NODE_ENV: 'test', REVIEW_INTENT_ENABLED: 'false' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `smart-diff-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 5,
      deletions: 1,
      filesCount: 5,
      status: 'needs_review',
    })
    .returning();
  await db.insert(t.prFiles).values([
    { prId: pr!.id, path: 'pnpm-lock.yaml', additions: 40, deletions: 0, patch: null },
    { prId: pr!.id, path: 'src/foo.test.ts', additions: 2, deletions: 0, patch: null },
    { prId: pr!.id, path: 'README.md', additions: 1, deletions: 0, patch: null },
    { prId: pr!.id, path: 'src/index.ts', additions: 1, deletions: 0, patch: null },
    { prId: pr!.id, path: 'src/config.ts', additions: 1, deletions: 1, patch: null },
  ]);
  return { repo: repo!, pr: pr! };
}

/** Inserts a review with findings, `createdAt` set explicitly so ordering is deterministic. */
async function insertReviewWithFindings(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  prId: string,
  createdAt: Date,
  findings: Array<{ file: string; startLine: number }>,
  agentId: string | null = null,
) {
  const [review] = await db
    .insert(t.reviews)
    .values({ workspaceId, prId, agentId, kind: 'review', verdict: 'approve', summary: 's', createdAt })
    .returning();
  if (findings.length > 0) {
    await db.insert(t.findings).values(
      findings.map((f) => ({
        reviewId: review!.id,
        file: f.file,
        startLine: f.startLine,
        endLine: f.startLine,
        severity: 'WARNING' as const,
        category: 'bug' as const,
        title: 't',
        rationale: 'r',
        confidence: 0.5,
      })),
    );
  }
  return review!;
}

d('GET /pulls/:id/smart-diff (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith() {
    const llm = new MockLLMProvider('openai');
    return {
      llm,
      appPromise: buildApp({
        config: config(),
        db: pg.handle.db,
        overrides: { llm: { openai: llm, anthropic: llm, openrouter: llm } },
      }),
    };
  }

  it('groups files by role, using only the newest review\'s finding lines, and makes 0 LLM calls', async () => {
    const { llm, appPromise } = appWith();
    const app = await appPromise;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const older = new Date('2026-01-01T00:00:00Z');
    const newer = new Date('2026-02-01T00:00:00Z');
    await insertReviewWithFindings(pg.handle.db, workspaceId, pr.id, older, [{ file: 'src/config.ts', startLine: 5 }]);
    await insertReviewWithFindings(pg.handle.db, workspaceId, pr.id, newer, [
      { file: 'src/config.ts', startLine: 11 },
      { file: 'src/foo.test.ts', startLine: 2 },
    ]);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SmartDiffResponse;
    expect(() => SmartDiffResponseSchema.parse(body)).not.toThrow();

    expect(body.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    const byRole = Object.fromEntries(body.groups.map((g) => [g.role, g.files]));
    expect(byRole.core).toEqual([{ path: 'src/config.ts', additions: 1, deletions: 1, finding_lines: [11] }]);
    expect(byRole.tests).toEqual([{ path: 'src/foo.test.ts', additions: 2, deletions: 0, finding_lines: [2] }]);
    expect(byRole.wiring).toEqual([{ path: 'src/index.ts', additions: 1, deletions: 0, finding_lines: [] }]);
    expect(byRole.docs).toEqual([{ path: 'README.md', additions: 1, deletions: 0, finding_lines: [] }]);
    expect(byRole.boilerplate).toEqual([{ path: 'pnpm-lock.yaml', additions: 40, deletions: 0, finding_lines: [] }]);

    expect(llm.calls).toHaveLength(0);
  });

  it("attaches every agent's newest review; an agent's older review is replaced", async () => {
    const { appPromise } = appWith();
    const app = await appPromise;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const [a, b] = await pg.handle.db.select({ id: t.agents.id }).from(t.agents).limit(2);

    // Agent A: older review (line 5) replaced by its newer one (line 11).
    await insertReviewWithFindings(pg.handle.db, workspaceId, pr.id, new Date('2026-01-01T00:00:00Z'), [{ file: 'src/config.ts', startLine: 5 }], a!.id);
    await insertReviewWithFindings(pg.handle.db, workspaceId, pr.id, new Date('2026-03-01T00:00:00Z'), [{ file: 'src/config.ts', startLine: 11 }], a!.id);
    // Agent B reviewed between them — still current, not hidden by A's newer run.
    await insertReviewWithFindings(pg.handle.db, workspaceId, pr.id, new Date('2026-02-01T00:00:00Z'), [{ file: 'src/config.ts', startLine: 7 }], b!.id);

    const body = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` })).json() as SmartDiffResponse;
    const core = body.groups.find((g) => g.role === 'core')!;
    expect(core.files[0]!.finding_lines).toEqual([7, 11]);
  });

  it('no review yet -> every file has an empty finding_lines', async () => {
    const { appPromise } = appWith();
    const app = await appPromise;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SmartDiffResponse;
    for (const group of body.groups) {
      for (const file of group.files) {
        expect(file.finding_lines).toEqual([]);
      }
    }
  });

  it('an unknown PR id is a 404', async () => {
    const { appPromise } = appWith();
    const app = await appPromise;

    const res = await app.inject({ method: 'GET', url: `/pulls/${randomUUID()}/smart-diff` });
    expect(res.statusCode).toBe(404);
  });
});
