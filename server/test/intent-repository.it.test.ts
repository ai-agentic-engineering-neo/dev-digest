import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import * as t from '../src/db/schema.js';
import { IntentRepository } from '../src/modules/intent/repository.js';
import type { DerivedIntentWrite } from '../src/modules/intent/ports.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const derivedWrite = (over: Partial<DerivedIntentWrite> = {}): DerivedIntentWrite => ({
  derived: { intent: 'Fix login', inScope: ['a'], outOfScope: ['b'] },
  kind: 'fix',
  confidence: 'high',
  confidenceReason: 'substantive_body',
  confidenceLowered: false,
  sources: [
    { id: 'title', kind: 'title', ref: 'Title', weight: 'strong', status: 'read', reason: null, used: true, cited: true, issue_number: null, path: null },
  ],
  headSha: 'sha-1',
  inputHash: 'in-1',
  bodyHash: 'body-1',
  usage: { provider: 'openai', model: 'gpt-4.1-mini', tokensIn: 10, tokensOut: 5, costUsd: 0.001 },
  ...over,
});

d('IntentRepository (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repo: IntentRepository;
  let ws1: string;
  let ws2: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    repo = new IntentRepository(pg.handle.db);
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
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath: '/clones/x' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId, repoId: r!.id, number: 1, title: 'T', author: 'a', branch: 'b', base: 'main', headSha: 'sha-1', body: 'body',
      })
      .returning();
    return pr!.id;
  }

  it('saveDerived round trip keeps sources jsonb', async () => {
    const prId = await newPr(ws1);
    const saved = await repo.saveDerived(prId, derivedWrite());
    const got = await repo.get(prId);
    expect(got).toEqual(saved);
    expect(got?.status).toBe('ok');
    expect(got?.sources[0]?.id).toBe('title');
    expect(got?.usage?.model).toBe('gpt-4.1-mini');
  });

  it('saveDerived after setOverride keeps the override', async () => {
    const prId = await newPr(ws1);
    await repo.setOverride(prId, { intent: 'Mine', inScope: ['x'], outOfScope: [], headSha: 'sha-1' });
    const rec = await repo.saveDerived(prId, derivedWrite());
    expect(rec.override?.intent).toBe('Mine');
    expect(rec.derived?.intent).toBe('Fix login');
  });

  it('saveFailure on an ok row changes nothing', async () => {
    const prId = await newPr(ws1);
    await repo.saveDerived(prId, derivedWrite());
    const rec = await repo.saveFailure(prId, { error: 'boom', sources: [], headSha: 'sha-2', inputHash: null, bodyHash: 'b', usage: null });
    expect(rec.status).toBe('ok');
    expect(rec.error).toBeNull();
    expect(rec.headSha).toBe('sha-1');
  });

  it('clearOverride deletes a none row and keeps a derived row', async () => {
    const onlyOverride = await newPr(ws1);
    await repo.setOverride(onlyOverride, { intent: 'Mine', inScope: [], outOfScope: [], headSha: 'sha-1' });
    expect(await repo.clearOverride(onlyOverride)).toBeUndefined();
    expect(await repo.get(onlyOverride)).toBeUndefined();

    const derived = await newPr(ws1);
    await repo.saveDerived(derived, derivedWrite());
    await repo.setOverride(derived, { intent: 'Mine', inScope: [], outOfScope: [], headSha: 'sha-1' });
    const cleared = await repo.clearOverride(derived);
    expect(cleared?.override).toBeNull();
    expect(cleared?.derived?.intent).toBe('Fix login');
  });

  it('getPullContext is workspace scoped', async () => {
    const prId = await newPr(ws1);
    const ctx = await repo.getPullContext(ws1, prId);
    expect(ctx).toMatchObject({ prId, owner: 'acme', cloned: true, headSha: 'sha-1' });
    expect(await repo.getPullContext(ws2, prId)).toBeUndefined();
  });

  it('deleting the PR cascades the intent row', async () => {
    const prId = await newPr(ws1);
    await repo.saveDerived(prId, derivedWrite());
    await pg.handle.db.delete(t.pullRequests).where(eq(t.pullRequests.id, prId));
    expect(await repo.get(prId)).toBeUndefined();
  });
});
