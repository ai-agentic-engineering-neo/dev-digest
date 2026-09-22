/**
 * Transactional data access: agent version bumps under concurrency, atomic
 * setSkills, and the repo-intel repository's transaction boundary.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';
import { RepoIntelRepository } from '../src/modules/repo-intel/infrastructure/repository.js';
import { DrizzleTransactionRunner } from '../src/db/transaction.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('transactional data access (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [repo] = await pg.handle.db.select().from(t.repos);
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('concurrent config edits each get their own version + snapshot (no lost bump)', async () => {
    const repo = new AgentsRepository(pg.handle.db);
    const agent = await repo.insert({
      workspaceId,
      name: 'Concurrent',
      provider: 'openai',
      model: 'm0',
      systemPrompt: 'p',
    });

    // Warm the pool so the updates really overlap (not serialized by connects).
    await Promise.all(Array.from({ length: 5 }, () => pg.handle.sql`select pg_sleep(0.05)`));
    const models = ['m1', 'm2', 'm3', 'm4'];
    const results = await Promise.all(
      models.map((model) => repo.update(workspaceId, agent.id, { model })),
    );

    expect(results.map((r) => r!.version).sort()).toEqual([2, 3, 4, 5]);
    const versions = await repo.listVersions(agent.id);
    expect(versions.map((v) => v.version)).toEqual([5, 4, 3, 2, 1]);
    const final = await repo.getById(workspaceId, agent.id);
    expect(final!.version).toBe(5);
  });

  it('setSkills is atomic: a bad skill id keeps the previous links', async () => {
    const repo = new AgentsRepository(pg.handle.db);
    const [agent] = await pg.handle.db.select().from(t.agents).limit(1);
    const [skill] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId, name: 's', description: 'd', type: 'custom', source: 'manual', body: 'b' })
      .returning();
    await repo.setSkills(agent!.id, [skill!.id]);

    await expect(
      repo.setSkills(agent!.id, [skill!.id, '00000000-0000-4000-8000-000000000000']),
    ).rejects.toThrow();

    expect(await repo.skillIdsForAgent(agent!.id)).toEqual([skill!.id]);
  });

  it('namesByIds resolves agent names in one call (workspace-scoped)', async () => {
    const repo = new AgentsRepository(pg.handle.db);
    const agents = await repo.list(workspaceId);
    const names = await repo.namesByIds(
      workspaceId,
      agents.map((a) => a.id),
    );
    expect(names.size).toBe(agents.length);
    expect(names.get(agents[0]!.id)).toBe(agents[0]!.name);
    expect((await repo.namesByIds('00000000-0000-4000-8000-000000000000', [agents[0]!.id])).size).toBe(0);
  });

  it('RepoIntelRepository.transaction rolls the whole reindex back on failure', async () => {
    const repo = new RepoIntelRepository(pg.handle.db);
    const sym = {
      repoId,
      path: 'a.ts',
      name: 'keep',
      kind: 'function',
      line: 1,
      endLine: 2,
      exported: true,
      signature: null,
      contentHash: 'h',
    };
    await repo.insertSymbols([sym]);

    await expect(
      repo.transaction(async (tx) => {
        await tx.deleteAllForRepo(repoId);
        await tx.insertSymbols([{ ...sym, name: 'new' }]);
        throw new Error('graph step exploded');
      }),
    ).rejects.toThrow('graph step exploded');

    const rows = await pg.handle.db.select().from(t.symbols).where(eq(t.symbols.repoId, repoId));
    expect(rows.map((r) => r.name)).toEqual(['keep']);
  });

  it('DrizzleTransactionRunner (TransactionRunner port) commits together or rolls back together', async () => {
    const runner = new DrizzleTransactionRunner(pg.handle.db, (tx) => ({ agents: new AgentsRepository(tx) }));
    const base = { workspaceId, provider: 'openai' as const, model: 'm', systemPrompt: 'p' };

    await expect(
      runner.run(async ({ agents }) => {
        await agents.insert({ ...base, name: 'TxRolledBack' });
        throw new Error('second write failed');
      }),
    ).rejects.toThrow('second write failed');
    const created = await runner.run(async ({ agents }) => agents.insert({ ...base, name: 'TxCommitted' }));

    const names = (await new AgentsRepository(pg.handle.db).list(workspaceId)).map((a) => a.name);
    expect(names).not.toContain('TxRolledBack');
    expect(names).toContain('TxCommitted');
    expect(created.name).toBe('TxCommitted');
  });
});
