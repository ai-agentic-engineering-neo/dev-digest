import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import * as t from '../src/db/schema.js';
import { DevdigestDocsRepository } from '../src/modules/context/repository/devdigest-docs.repo.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const P = (name: string) => `.devdigest/specs/${name}`;

d('DevdigestDocsRepository (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repo: DevdigestDocsRepository;
  let wsA: string;
  let wsB: string;
  let repoA: string;
  let repoA2: string;
  const agents: string[] = [];

  async function newRepo(workspaceId: string, name: string): Promise<string> {
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    return r!.id;
  }

  beforeAll(async () => {
    pg = await startPg();
    repo = new DevdigestDocsRepository(pg.handle.db);
    const [a] = await pg.handle.db.insert(t.workspaces).values({ name: 'A' }).returning();
    const [b] = await pg.handle.db.insert(t.workspaces).values({ name: 'B' }).returning();
    wsA = a!.id;
    wsB = b!.id;
    repoA = await newRepo(wsA, 'dd-one');
    repoA2 = await newRepo(wsA, 'dd-two');
    for (const name of ['Zed', 'Alpha']) {
      const [ag] = await pg.handle.db
        .insert(t.agents)
        .values({ workspaceId: wsA, name, provider: 'openrouter', model: 'm', systemPrompt: 'p' })
        .returning();
      agents.push(ag!.id);
    }
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const add = (path: string, repoId = repoA, content = 'c') =>
    repo.insert({ workspaceId: wsA, repoId, path, content, copiedFrom: null });

  it('lists in byte order and scopes by workspace', async () => {
    await add(P('a.md'));
    await add(P('B.md'));
    const list = await repo.listByRepo(wsA, repoA);
    expect(list.map((r) => r.path)).toEqual([P('B.md'), P('a.md')]);
    expect(await repo.listByRepo(wsB, repoA)).toEqual([]);
    expect(await repo.countByRepo(wsA, repoA)).toBe(2);
    expect(await repo.countByRepo(wsB, repoA)).toBe(0);
    expect(await repo.getByPaths(wsB, repoA, [P('a.md')])).toEqual([]);
    expect((await repo.getByPaths(wsA, repoA, [P('a.md')])).length).toBe(1);
    expect(await repo.getByPaths(wsA, repoA, [])).toEqual([]);
  });

  it('returns undefined and changes nothing for another workspace', async () => {
    const doc = (await add(P('scoped.md')))!;
    expect(await repo.getById(wsB, doc.id)).toBeUndefined();
    expect(await repo.updateContent(wsB, doc.id, 'hacked')).toBeUndefined();
    expect(await repo.deleteAndDetach(wsB, doc.id)).toBeUndefined();
    const again = await repo.getById(wsA, doc.id);
    expect(again?.content).toBe('c');
  });

  it('insert of an existing (repo, path) returns undefined', async () => {
    await add(P('dup.md'));
    const before = await repo.countByRepo(wsA, repoA);
    expect(await add(P('dup.md'))).toBeUndefined();
    expect(await repo.countByRepo(wsA, repoA)).toBe(before);
  });

  it('updateContent bumps updated_at', async () => {
    const doc = (await add(P('upd.md')))!;
    const saved = await repo.updateContent(wsA, doc.id, 'new');
    expect(saved?.content).toBe('new');
    expect(saved!.updatedAt.getTime()).toBeGreaterThanOrEqual(doc.updatedAt.getTime());
  });

  it('deleteAndDetach removes the doc and only that repo path attachments', async () => {
    const path = P('att.md');
    const doc = (await add(path))!;
    await add(path, repoA2);
    await pg.handle.db.insert(t.agentContextDocs).values([
      { agentId: agents[0]!, repoId: repoA, path, position: 0 },
      { agentId: agents[1]!, repoId: repoA, path, position: 0 },
      { agentId: agents[0]!, repoId: repoA2, path, position: 0 },
    ]);
    expect((await repo.attachedAgents(wsA, repoA, path)).map((a) => a.name)).toEqual(['Alpha', 'Zed']);
    expect(await repo.attachedAgents(wsB, repoA, path)).toEqual([]);

    const res = await repo.deleteAndDetach(wsA, doc.id);
    expect(res).toEqual({ repoId: repoA, path, detached: 2 });
    expect(await repo.getById(wsA, doc.id)).toBeUndefined();
    const left = await pg.handle.db.select().from(t.agentContextDocs).where(eq(t.agentContextDocs.repoId, repoA2));
    expect(left.length).toBe(1);
  });

  it('deleting the repo cascades to its docs', async () => {
    const r = await newRepo(wsA, 'dd-cascade');
    await add(P('gone.md'), r);
    await pg.handle.db.delete(t.repos).where(eq(t.repos.id, r));
    expect(await repo.countByRepo(wsA, r)).toBe(0);
  });
});
