/**
 * PR list FINDINGS column — `GET /repos/:id/pulls` rolls up the LATEST review's
 * findings per PR: per-severity counts + read-only previews for the popover,
 * computed by grouping persisted rows (no model call). Older reviews are
 * ignored; a never-reviewed PR reports null. Gated on Docker like the other
 * integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { PrMeta } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let seq = 0;
async function setupRepoAndPrs(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `findings-${seq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const mk = async (number: number) => {
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number,
        title: `PR ${number}`,
        author: 'a',
        branch: `b${number}`,
        base: 'main',
        headSha: `sha${number}`,
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'open',
      })
      .returning();
    return pr!;
  };
  return { repo: repo!, reviewed: await mk(1), unreviewed: await mk(2) };
}

function finding(reviewId: string, severity: string, title: string, rationale = 'Because.') {
  return {
    reviewId,
    file: 'src/config.ts',
    startLine: 12,
    endLine: 12,
    severity,
    category: 'security',
    title,
    rationale,
    suggestion: null,
    confidence: 0.9,
  };
}

d('PR list findings rollup (Testcontainers pg)', () => {
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

  it('counts the latest review only, ships previews, and reports null when never reviewed', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const { repo, reviewed, unreviewed } = await setupRepoAndPrs(pg.handle.db, workspaceId);

    // Older review: 1 SUGGESTION (must be ignored).
    const [older] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: reviewed.id, kind: 'review', verdict: 'comment', score: 90, model: 'm' })
      .returning();
    await pg.handle.db.insert(t.findings).values([finding(older!.id, 'SUGGESTION', 'Old nit')]);
    // Newest review: 2 CRITICAL + 1 WARNING.
    const [latest] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: reviewed.id,
        kind: 'review',
        verdict: 'request_changes',
        score: 30,
        model: 'm',
        createdAt: new Date(Date.now() + 1000),
      })
      .returning();
    await pg.handle.db.insert(t.findings).values([
      finding(latest!.id, 'CRITICAL', 'Hardcoded Stripe secret key', 'Line 12 has a `sk_live_` key.\n\nMore.'),
      finding(latest!.id, 'CRITICAL', 'SQL injection'),
      finding(latest!.id, 'WARNING', 'N+1 query'),
    ]);

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const byNumber = new Map((res.json() as PrMeta[]).map((p) => [p.number, p]));

    const r = byNumber.get(1)!;
    expect(r.score).toBe(30);
    expect(r.findings_critical).toBe(2);
    expect(r.findings_warning).toBe(1);
    expect(r.findings_suggestion).toBe(0);
    expect(r.latest_findings).toHaveLength(3);
    const preview = r.latest_findings!.find((f) => f.title === 'Hardcoded Stripe secret key')!;
    expect(preview).toMatchObject({
      severity: 'CRITICAL',
      category: 'security',
      file: 'src/config.ts',
      start_line: 12,
      confidence: 0.9,
      excerpt: 'Line 12 has a sk_live_ key.',
    });

    const u = byNumber.get(2)!;
    expect(u.findings_critical).toBeNull();
    expect(u.latest_findings).toBeNull();
    expect(unreviewed.id).toBeTruthy();
    await app.close();
  });
});
