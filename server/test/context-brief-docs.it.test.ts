import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import * as t from '../src/db/schema.js';
import { ContextRepository } from '../src/modules/context/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('ContextRepository.listEnabledAgentAttachments (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repo: ContextRepository;
  let wsA: string;
  let wsB: string;
  let repoId: string;

  async function agent(workspaceId: string, name: string, enabled = true): Promise<string> {
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId, name, provider: 'openrouter', model: 'm', systemPrompt: 'p', enabled })
      .returning();
    return a!.id;
  }
  const attach = (agentId: string, paths: string[]) =>
    pg.handle.db.insert(t.agentContextDocs).values(paths.map((path, position) => ({ agentId, repoId, path, position })));

  beforeAll(async () => {
    pg = await startPg();
    repo = new ContextRepository(pg.handle.db);
    const [a] = await pg.handle.db.insert(t.workspaces).values({ name: 'A' }).returning();
    const [b] = await pg.handle.db.insert(t.workspaces).values({ name: 'B' }).returning();
    wsA = a!.id;
    wsB = b!.id;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: wsA, owner: 'acme', name: 'brief-docs', fullName: 'acme/brief-docs' })
      .returning();
    repoId = r!.id;
    await attach(await agent(wsA, 'alpha'), ['docs/2.md', 'docs/1.md']);
    await attach(await agent(wsA, 'Zed'), ['specs/z.md']);
    await attach(await agent(wsA, 'off', false), ['specs/off.md']);
    await attach(await agent(wsB, 'foreign'), ['specs/foreign.md']);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('enabled agents only, collate "C" name order, positions respected, own workspace only', async () => {
    const rows = await repo.listEnabledAgentAttachments(wsA, repoId);
    expect(rows.map((r) => r.path)).toEqual(['specs/z.md', 'docs/2.md', 'docs/1.md']);
  });

  it('another workspace sees only its own agents', async () => {
    const rows = await repo.listEnabledAgentAttachments(wsB, repoId);
    expect(rows.map((r) => r.path)).toEqual(['specs/foreign.md']);
  });
});
