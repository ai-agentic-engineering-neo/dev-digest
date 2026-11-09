import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import * as t from '../src/db/schema.js';
import { BriefRepository } from '../src/modules/brief/repository.js';
import type { StoredBrief } from '../src/modules/brief/domain/types.js';
import fixture from './fixtures/brief-response.json';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const brief = (summary: string): StoredBrief => ({ ...(fixture.brief as StoredBrief), summary });

d('BriefRepository (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repo: BriefRepository;
  let ws1: string;
  let ws2: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    repo = new BriefRepository(pg.handle.db);
    const [a, b] = await pg.handle.db.insert(t.workspaces).values([{ name: 'one' }, { name: 'two' }]).returning();
    ws1 = a!.id;
    ws2 = b!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function newPr(workspaceId: string): Promise<string> {
    const name = `app-${seq++}`;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId, repoId: r!.id, number: 1, title: 'T', author: 'a', branch: 'b', base: 'main', headSha: 'sha-1', body: 'body',
      })
      .returning();
    return pr!.id;
  }

  it('getPullContext is workspace scoped', async () => {
    const prId = await newPr(ws1);
    const ctx = await repo.getPullContext(ws1, prId);
    expect(ctx).toMatchObject({ prId, number: 1, title: 'T', headSha: 'sha-1', fullName: expect.stringContaining('acme/') });
    expect(await repo.getPullContext(ws2, prId)).toBeUndefined();
  });

  it('save twice replaces; get without a row is undefined; invalid json is undefined', async () => {
    const prId = await newPr(ws1);
    expect(await repo.get(prId)).toBeUndefined();
    await repo.save(prId, brief('first'));
    await repo.save(prId, brief('second'));
    expect((await repo.get(prId))?.summary).toBe('second');

    const bad = await newPr(ws1);
    await pg.handle.db.insert(t.prBrief).values({ prId: bad, json: {} });
    expect(await repo.get(bad)).toBeUndefined();
  });

  it('listChangedFiles is path ordered; countChangedFiles matches', async () => {
    const prId = await newPr(ws1);
    await pg.handle.db.insert(t.prFiles).values([
      { prId, path: 'b.ts', additions: 2, deletions: 1, patch: '@@ -1 +1 @@' },
      { prId, path: 'a.ts', additions: 5, deletions: 0, patch: null },
    ]);
    const files = await repo.listChangedFiles(prId);
    expect(files.map((f) => f.path)).toEqual(['a.ts', 'b.ts']);
    expect(files[1]).toEqual({ path: 'b.ts', additions: 2, deletions: 1, patch: '@@ -1 +1 @@' });
    expect(await repo.countChangedFiles(prId)).toBe(2);
  });

  it('featureModelOverride reads risk_brief only; malformed is undefined', async () => {
    const choice = { provider: 'openai', model: 'gpt-4.1-mini' };
    await pg.handle.db
      .insert(t.settings)
      .values({ workspaceId: ws1, key: 'feature_models', value: { review_intent: choice } });
    expect(await repo.featureModelOverride(ws1)).toBeUndefined();

    await pg.handle.db
      .insert(t.settings)
      .values({ workspaceId: ws2, key: 'feature_models', value: { risk_brief: { provider: 'nope' } } });
    expect(await repo.featureModelOverride(ws2)).toBeUndefined();

    await pg.handle.db
      .update(t.settings)
      .set({ value: { review_intent: choice, risk_brief: choice } })
      .where(eq(t.settings.workspaceId, ws1));
    expect(await repo.featureModelOverride(ws1)).toEqual(choice);
  });
});
