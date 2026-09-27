import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SmartDiffResponse } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('GET /pulls/:id/smart-diff (Testcontainers pg)', () => {
  let pg: PgFixture;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces);
    const workspaceId = ws!.id;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'sd', fullName: 'acme/sd' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'x',
        author: 'a',
        branch: 'f',
        base: 'main',
        headSha: 'abc',
        additions: 4,
        deletions: 0,
        filesCount: 4,
        status: 'needs_review',
      })
      .returning();
    prId = pr!.id;
    await db.insert(t.prFiles).values(
      ['src/a.ts', 'src/a.test.ts', 'pnpm-lock.yaml', 'README.md'].map((path) => ({
        prId,
        path,
        additions: 1,
        deletions: 0,
      })),
    );
    const agentId = randomUUID();
    const mkReview = async (createdAt: Date) => {
      const [r] = await db
        .insert(t.reviews)
        .values({ workspaceId, prId, agentId, kind: 'review', createdAt })
        .returning();
      return r!.id;
    };
    const finding = (reviewId: string, line: number, dismissedAt: Date | null = null) => ({
      reviewId,
      file: 'src/a.ts',
      startLine: line,
      endLine: line,
      severity: 'WARNING',
      category: 'bug',
      title: 't',
      rationale: 'r',
      confidence: 0.9,
      dismissedAt,
    });
    const older = await mkReview(new Date('2026-01-01T00:00:00Z'));
    const newer = await mkReview(new Date('2026-01-02T00:00:00Z'));
    await db.insert(t.findings).values([
      finding(older, 5),
      finding(newer, 12),
      finding(newer, 20, new Date()),
    ]);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('groups files by role and uses only the latest review, skipping dismissed', async () => {
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
    });
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = SmartDiffResponse.parse(res.json());
    expect(body.groups.map((g) => g.role)).toEqual(['core', 'tests', 'docs', 'boilerplate']);
    expect(body.groups.at(-1)!.files.map((f) => f.path)).toEqual(['pnpm-lock.yaml']);
    expect(body.groups[0]!.files[0]!.finding_lines).toEqual([12]);
    expect(body.split_suggestion).toMatchObject({ total_lines: 4, too_big: false });

    const missing = await app.inject({ method: 'GET', url: `/pulls/${randomUUID()}/smart-diff` });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });
});
