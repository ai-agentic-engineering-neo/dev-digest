import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { IntentRepository } from '../src/modules/intent/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * Confirms the two-pass migration (0015_flowery_randall_flagg.sql adds the
 * three jsonb columns; 0016_material_marrow.sql drops `intent_confidence` —
 * specs/05-intent-layer.md's Schema changes section) applies cleanly against
 * a fresh Postgres via `startPg()`'s `runMigrations`, and that the three new
 * columns round-trip through `IntentRepository.saveIntent`.
 */
d('intent module schema (Testcontainers pg)', () => {
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

  it('intent_in_scope / intent_out_of_scope / intent_context_gaps round-trip; intent_confidence no longer exists', async () => {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'schema-rt', fullName: 'acme/schema-rt' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Round-trip test PR',
        author: 'octocat',
        branch: 'feat/x',
        base: 'main',
        headSha: 'deadbeef',
      })
      .returning();

    const intentRepo = new IntentRepository(pg.handle.db);
    await intentRepo.saveIntent(pr!.id, {
      summary: 'Adds rate limiting.',
      inScope: ['Rate limiter middleware'],
      outOfScope: ['Authentication changes'],
      contextGaps: ['PR description is empty or near-empty'],
      signals: ['PR description'],
    });

    const rows = await pg.handle.db.select().from(t.pullRequests);
    const saved = rows.find((r) => r.id === pr!.id)!;
    expect(saved.intentSummary).toBe('Adds rate limiting.');
    expect(saved.intentInScope).toEqual(['Rate limiter middleware']);
    expect(saved.intentOutOfScope).toEqual(['Authentication changes']);
    expect(saved.intentContextGaps).toEqual(['PR description is empty or near-empty']);
    expect(saved.intentResolvedAt).not.toBeNull();
    // Revision 2 removed intent_confidence entirely — the row type must not
    // carry it any more (a compile-time guard as much as a runtime one).
    expect((saved as unknown as { intentConfidence?: unknown }).intentConfidence).toBeUndefined();
  });
});
