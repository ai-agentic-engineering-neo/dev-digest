/**
 * GET /pulls/:id/smart-diff — role classification, split_suggestion,
 * finding_lines (TP-1 parity) and tenancy/validation. Setup pattern follows
 * `server/test/pulls-comments.it.test.ts`. Gated on Docker like the other
 * integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { SmartDiff, type SmartDiffRole } from '@devdigest/shared';
import { SmartDiffService } from '../src/modules/smart-diff/service.js';
import { randomUUID } from 'node:crypto';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const RANDOM_UUID = '00000000-0000-0000-0000-000000000000';

interface FileInput {
  path: string;
  additions: number;
  deletions: number;
  patch?: string | null;
}

let repoSeq = 0;

d('GET /pulls/:id/smart-diff (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    app = await buildApp({ config: config(), db: pg.handle.db });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  async function setupPr(files: FileInput[], ws: string = workspaceId) {
    const name = `smart-diff-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: repoSeq,
        title: 'Smart diff fixture PR',
        author: 'marisa.koch',
        branch: 'feat/smart-diff',
        base: 'main',
        headSha: 'a1b2c3d',
        additions: 0,
        deletions: 0,
        filesCount: files.length,
        status: 'needs_review',
      })
      .returning();
    if (files.length > 0) {
      await pg.handle.db.insert(t.prFiles).values(
        files.map((f) => ({
          prId: pr!.id,
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
      );
    }
    return { repo: repo!, pr: pr! };
  }

  it('200 with five roles present, total_lines 400, too_big true, and a valid SmartDiff body', async () => {
    const { pr } = await setupPr([
      { path: 'src/a.ts', additions: 10, deletions: 2 },
      { path: 'src/a.test.ts', additions: 5, deletions: 0 },
      { path: 'tsconfig.json', additions: 1, deletions: 0 },
      { path: 'README.md', additions: 3, deletions: 0 },
      { path: 'pnpm-lock.yaml', additions: 379, deletions: 0 },
    ]);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(() => SmartDiff.parse(body)).not.toThrow();
    expect(body.groups.map((g: { role: SmartDiffRole }) => g.role)).toEqual([
      'core',
      'tests',
      'wiring',
      'docs',
      'boilerplate',
    ]);
    expect(body.split_suggestion.total_lines).toBe(400);
    expect(body.split_suggestion.too_big).toBe(true);
  });

  it('a PR with no pr_files rows returns 200 with empty groups and a zeroed split_suggestion', async () => {
    const { pr } = await setupPr([]);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      groups: [],
      split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
    });
  });

  it('404s for a PR belonging to another workspace', async () => {
    const [other] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-smart-diff-${Math.random().toString(36).slice(2, 8)}` })
      .returning();
    const { pr } = await setupPr([{ path: 'src/a.ts', additions: 1, deletions: 0 }], other!.id);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(404);
  });

  it('404s for a well-formed but non-existent uuid', async () => {
    const res = await app.inject({ method: 'GET', url: `/pulls/${RANDOM_UUID}/smart-diff` });
    expect(res.statusCode).toBe(404);
  });

  it('422s for a non-uuid :id', async () => {
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/smart-diff' });
    expect(res.statusCode).toBe(422);
  });

  it('TP-1: finding_lines reflects only the latest review per agent and never a dismissed line', async () => {
    const { pr } = await setupPr([
      { path: 'a.ts', additions: 1, deletions: 0 },
      { path: 'b.md', additions: 1, deletions: 0 },
    ]);

    // R1 agent A (superseded), R2 agent A (kept), R3 agent B (kept),
    // R4 agent null (superseded), R5 agent null (kept) — Test brief TP-1.
    const agentA = randomUUID();
    const agentB = randomUUID();
    const [r1, r2, r3, r4, r5] = await pg.handle.db
      .insert(t.reviews)
      .values([
        { workspaceId, prId: pr.id, kind: 'review' as const, agentId: agentA, createdAt: new Date('2026-09-01T10:00:00Z') },
        { workspaceId, prId: pr.id, kind: 'review' as const, agentId: agentA, createdAt: new Date('2026-09-02T10:00:00Z') },
        { workspaceId, prId: pr.id, kind: 'review' as const, agentId: agentB, createdAt: new Date('2026-09-01T12:00:00Z') },
        { workspaceId, prId: pr.id, kind: 'review' as const, agentId: null, createdAt: new Date('2026-08-30T00:00:00Z') },
        { workspaceId, prId: pr.id, kind: 'review' as const, agentId: null, createdAt: new Date('2026-08-31T00:00:00Z') },
      ])
      .returning();

    await pg.handle.db.insert(t.findings).values([
      // R1 (agent A, superseded by R2) — must not leak into finding_lines.
      {
        reviewId: r1!.id,
        file: 'a.ts',
        startLine: 10,
        endLine: 10,
        severity: 'CRITICAL',
        category: 'bug',
        title: 'f1 (superseded)',
        rationale: 'from the superseded run',
        confidence: 0.9,
      },
      // R4 (agent null, superseded by R5) — must not leak into finding_lines
      // either. Without this row the null-agent half of "latest per agent" was
      // never actually exercised: dropping the grouping entirely would still
      // have left a.ts at [20, 50].
      {
        reviewId: r4!.id,
        file: 'a.ts',
        startLine: 40,
        endLine: 40,
        severity: 'WARNING',
        category: 'bug',
        title: 'f5 (superseded, null agent)',
        rationale: 'from the superseded null-agent run',
        confidence: 0.6,
      },
      // R2 (agent A, kept): a.ts:20
      {
        reviewId: r2!.id,
        file: 'a.ts',
        startLine: 20,
        endLine: 20,
        severity: 'WARNING',
        category: 'bug',
        title: 'f2',
        rationale: 'kept',
        confidence: 0.8,
      },
      // R3 (agent B, kept): a.ts:30 dismissed (must not count), b.md:5 accepted (must count)
      {
        reviewId: r3!.id,
        file: 'a.ts',
        startLine: 30,
        endLine: 30,
        severity: 'SUGGESTION',
        category: 'style',
        title: 'f3 (dismissed)',
        rationale: 'dismissed',
        confidence: 0.5,
        dismissedAt: new Date('2026-09-03T00:00:00Z'),
      },
      {
        reviewId: r3!.id,
        file: 'b.md',
        startLine: 5,
        endLine: 5,
        severity: 'WARNING',
        category: 'docs',
        title: 'f4 (accepted)',
        rationale: 'accepted, still active',
        confidence: 0.7,
        acceptedAt: new Date('2026-09-03T00:00:00Z'),
      },
      // R5 (agent null, kept): a.ts:50
      {
        reviewId: r5!.id,
        file: 'a.ts',
        startLine: 50,
        endLine: 50,
        severity: 'SUGGESTION',
        category: 'style',
        title: 'f6',
        rationale: 'kept (null-agent group)',
        confidence: 0.6,
      },
    ]);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const files = body.groups.flatMap((g: { files: { path: string; finding_lines: number[] }[] }) => g.files);
    const byPath = new Map(files.map((f: { path: string; finding_lines: number[] }) => [f.path, f.finding_lines]));
    expect(byPath.get('a.ts')).toEqual([20, 50]);
    expect(byPath.get('b.md')).toEqual([5]);
  });

  it('logs one summary line with no path/patch/finding text, even when the patch carries a secret-shaped sentinel', async () => {
    const { pr } = await setupPr([
      { path: 'src/config.ts', additions: 1, deletions: 0, patch: 'SECRET_PATCH_SENTINEL' },
    ]);

    const calls: { obj: unknown; msg?: string }[] = [];
    const fakeLogger = {
      info: (obj: unknown, msg?: string) => calls.push({ obj, msg }),
      warn: () => {},
      error: () => {},
      debug: () => {},
    };

    await new SmartDiffService(app.container).get(workspaceId, pr.id, fakeLogger);

    expect(calls).toHaveLength(1);
    const rec = calls[0]!.obj as Record<string, unknown>;
    expect(Object.keys(rec)).toEqual(
      expect.arrayContaining(['prId', 'files', 'byRole', 'findings', 'durationMs']),
    );
    expect(typeof rec.durationMs).toBe('number');
    expect(JSON.stringify(calls)).not.toContain('SECRET_PATCH_SENTINEL');
    // "no path" is the other half of the title's promise: a regression that
    // logs `files.map(f => f.path)` carries no patch text but would still leak
    // the file path, so the sentinel check alone cannot catch it.
    expect(JSON.stringify(calls)).not.toContain('src/config.ts');
  });
});
