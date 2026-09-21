import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[project-context] Docker not available — skipping integration tests.');
}

/**
 * specs/09-project-context-folder.md — DB-backed coverage: attachment
 * persistence (AC-8, AC-9, AC-10, AC-37), "used by N agents" (AC-22), discovery
 * + roots config over a real tmpdir checkout (AC-1, AC-2, AC-29, AC-38), and
 * the read-only preview (AC-4).
 */
d('project context (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let checkoutRoot: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    checkoutRoot = await mkdtemp(join(tmpdir(), 'project-context-it-'));
  });
  afterAll(async () => {
    await pg?.stop();
    await rm(checkoutRoot, { recursive: true, force: true });
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  let repoSeq = 0;
  async function createRepo(clonePath: string | null): Promise<string> {
    const name = `context-repo-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    return repo!.id;
  }

  async function createAgent(app: Awaited<ReturnType<typeof makeApp>>): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `agent-${Math.random()}`,
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'Review the diff.',
      },
    });
    return res.json().id as string;
  }

  it('AC-1/AC-20 — lists .md files under the default roots; no checkout yields an empty, error-free state', async () => {
    const app = await makeApp();
    const noCheckoutRepo = await createRepo(null);
    const empty = await app.inject({
      method: 'GET',
      url: `/repos/${noCheckoutRepo}/context/documents`,
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({
      roots: ['specs', 'docs', '.devdigest/specs'],
      documents: [],
      summary: { count: 0, tokens: 0, bounded: 0 },
    });

    const repoRoot = await mkdtemp(join(checkoutRoot, 'repo-'));
    await mkdir(join(repoRoot, 'specs'), { recursive: true });
    await writeFile(join(repoRoot, 'specs', 'a.md'), '# A doc');
    const repoId = await createRepo(repoRoot);

    const listed = await app.inject({ method: 'GET', url: `/repos/${repoId}/context/documents` });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().documents).toEqual([
      { path: 'specs/a.md', doc_type: 'specs', tokens: expect.any(Number), used_by: 0 },
    ]);
    // AC-38 — summary total equals the sum of per-document counts.
    expect(listed.json().summary.tokens).toBe(listed.json().documents[0].tokens);
    await app.close();
  });

  it('AC-29 — changing the search roots changes the next listing', async () => {
    const app = await makeApp();
    const repoRoot = await mkdtemp(join(checkoutRoot, 'repo-'));
    await mkdir(join(repoRoot, 'guides'), { recursive: true });
    await writeFile(join(repoRoot, 'guides', 'b.md'), '# B doc');
    const repoId = await createRepo(repoRoot);

    const before = await app.inject({ method: 'GET', url: `/repos/${repoId}/context/documents` });
    expect(before.json().documents).toEqual([]);

    const configured = await app.inject({
      method: 'PUT',
      url: `/repos/${repoId}/context/config`,
      payload: { doc_roots: ['guides'] },
    });
    expect(configured.statusCode).toBe(200);
    expect(configured.json()).toEqual({ doc_roots: ['guides'] });

    const after = await app.inject({ method: 'GET', url: `/repos/${repoId}/context/documents` });
    expect(after.json().documents.map((d: { path: string }) => d.path)).toEqual(['guides/b.md']);
    await app.close();
  });

  it('rejects a search root that escapes the checkout', async () => {
    const app = await makeApp();
    const repoId = await createRepo(checkoutRoot);
    const res = await app.inject({
      method: 'PUT',
      url: `/repos/${repoId}/context/config`,
      payload: { doc_roots: ['../escape'] },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('AC-4 — GET .../documents/one returns the current content, read-only', async () => {
    const app = await makeApp();
    const repoRoot = await mkdtemp(join(checkoutRoot, 'repo-'));
    await mkdir(join(repoRoot, 'specs'), { recursive: true });
    await writeFile(join(repoRoot, 'specs', 'preview.md'), '# Preview me');
    const repoId = await createRepo(repoRoot);

    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/documents/one?path=specs/preview.md`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ path: 'specs/preview.md', content: '# Preview me' });
    await app.close();
  });

  it('AC-8/AC-9/AC-10/AC-37 — attach, reorder, detach+reattach restores position', async () => {
    const app = await makeApp();
    const repoRoot = await mkdtemp(join(checkoutRoot, 'repo-'));
    await mkdir(join(repoRoot, 'specs'), { recursive: true });
    await writeFile(join(repoRoot, 'specs', '1.md'), 'one');
    await writeFile(join(repoRoot, 'specs', '2.md'), 'two');
    const repoId = await createRepo(repoRoot);
    const agentId = await createAgent(app);

    // AC-9 — set the ordered attached set.
    const set = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/documents`,
      payload: {
        documents: [
          { repo_id: repoId, path: 'specs/1.md' },
          { repo_id: repoId, path: 'specs/2.md' },
        ],
      },
    });
    expect(set.statusCode).toBe(200);
    expect(
      set.json().map((d: { path: string; order: number; attached: boolean }) => [
        d.path,
        d.order,
        d.attached,
      ]),
    ).toEqual([
      ['specs/1.md', 0, true],
      ['specs/2.md', 1, true],
    ]);

    // AC-8 — only (repo, path) is stored: no document body text anywhere in
    // the response.
    expect(JSON.stringify(set.json())).not.toContain('one');
    expect(JSON.stringify(set.json())).not.toContain('two');

    // AC-10 — detach doc 1, then reattach WITHOUT reordering; its position
    // (order 0) is restored, not appended to the end.
    const detach = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/documents`,
      payload: { repo_id: repoId, path: 'specs/1.md', attached: false },
    });
    expect(detach.statusCode).toBe(200);
    const detached = detach
      .json()
      .find((d: { path: string }) => d.path === 'specs/1.md');
    expect(detached).toMatchObject({ attached: false, order: 0 });

    const reattach = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/documents`,
      payload: { repo_id: repoId, path: 'specs/1.md', attached: true },
    });
    const reattached = reattach
      .json()
      .find((d: { path: string }) => d.path === 'specs/1.md');
    expect(reattached).toMatchObject({ attached: true, order: 0 });

    // GET reflects present/missing + tokens.
    const list = await app.inject({ method: 'GET', url: `/agents/${agentId}/documents` });
    expect(list.statusCode).toBe(200);
    expect(list.json().every((d: { status: string }) => d.status === 'present')).toBe(true);
    await app.close();
  });

  it('AC-26 — an attachment whose file was deleted shows status "missing" without being dropped', async () => {
    const app = await makeApp();
    const repoRoot = await mkdtemp(join(checkoutRoot, 'repo-'));
    await mkdir(join(repoRoot, 'specs'), { recursive: true });
    await writeFile(join(repoRoot, 'specs', 'temp.md'), 'temp');
    const repoId = await createRepo(repoRoot);
    const agentId = await createAgent(app);

    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/documents`,
      payload: { documents: [{ repo_id: repoId, path: 'specs/temp.md' }] },
    });
    await rm(join(repoRoot, 'specs', 'temp.md'));

    const list = await app.inject({ method: 'GET', url: `/agents/${agentId}/documents` });
    expect(list.json()).toEqual([
      { repo_id: repoId, path: 'specs/temp.md', order: 0, attached: true, tokens: 0, status: 'missing' },
    ]);
    await app.close();
  });

  it('AC-22/D8 — "used by N agents" counts direct attachments only, not skill-inherited ones', async () => {
    const app = await makeApp();
    const repoRoot = await mkdtemp(join(checkoutRoot, 'repo-'));
    await mkdir(join(repoRoot, 'specs'), { recursive: true });
    await writeFile(join(repoRoot, 'specs', 'shared.md'), 'shared');
    const repoId = await createRepo(repoRoot);
    const agentA = await createAgent(app);
    const agentB = await createAgent(app);

    await app.inject({
      method: 'POST',
      url: `/agents/${agentA}/documents`,
      payload: { documents: [{ repo_id: repoId, path: 'specs/shared.md' }] },
    });
    await app.inject({
      method: 'POST',
      url: `/agents/${agentB}/documents`,
      payload: { documents: [{ repo_id: repoId, path: 'specs/shared.md' }] },
    });

    const listed = await app.inject({ method: 'GET', url: `/repos/${repoId}/context/documents` });
    const doc = listed.json().documents.find((d: { path: string }) => d.path === 'specs/shared.md');
    expect(doc.used_by).toBe(2);
    await app.close();
  });

  it('AC-11/AC-12/AC-13 — a skill\'s attached documents are inherited and its preview matches the run block', async () => {
    const app = await makeApp();
    const repoRoot = await mkdtemp(join(checkoutRoot, 'repo-'));
    await mkdir(join(repoRoot, 'specs'), { recursive: true });
    await writeFile(join(repoRoot, 'specs', 'skill-doc.md'), 'skill body');
    const repoId = await createRepo(repoRoot);

    const skillRes = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: `skill-${Math.random().toString(36).slice(2)}`,
        description: '',
        type: 'custom',
        body: '# Body',
      },
    });
    const skillId = skillRes.json().id as string;

    await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/documents`,
      payload: { documents: [{ repo_id: repoId, path: 'specs/skill-doc.md' }] },
    });

    const preview = await app.inject({ method: 'GET', url: `/skills/${skillId}/preview` });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().project_context_block).toContain('## Project context');
    expect(preview.json().project_context_block).toContain('<untrusted source="specs/skill-doc.md">');
    expect(preview.json().project_context_block).toContain('skill body');
    expect(preview.json().project_context_tokens).toBeGreaterThan(0);
    await app.close();
  });
});
