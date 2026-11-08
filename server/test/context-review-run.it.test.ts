import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { RepoRef, Review, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient, MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/* SPEC-01 AC-8 … AC-13: attached project-context docs reach every model call of a run through the
   engine's untrusted `specs` slot, and the trace gets a `project_context` block. */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

// Two changed files → map-reduce makes one model call per file.
const DIFF = `diff --git a/src/db.ts b/src/db.ts
--- a/src/db.ts
+++ b/src/db.ts
@@ -10,3 +10,4 @@
   const x = 1;
+  const q = 1;
   return x;
diff --git a/docs/a.md b/docs/a.md
--- a/docs/a.md
+++ b/docs/a.md
@@ -1,1 +1,2 @@
 # A
+more`;

const REVIEW: Review = { verdict: 'approve', summary: 'ok', score: 90, findings: [] };

const FILES: Record<string, string> = {
  'docs/a.md': 'DOC-A rate limits apply to public endpoints.',
  'docs/b.md': 'DOC-B every query is parameterized.',
  'docs/new.md': 'DOC-NEW replacement doc.',
  'specs/big.md': 'B'.repeat(5000 * 4),
  'docs/evil.md': 'DOC-EVIL from another workspace.',
};

class FakeGit extends MockGitClient {
  override async readFile(_repo: RepoRef, path: string): Promise<string> {
    const body = FILES[path];
    if (body === undefined) throw new Error(`ENOENT ${path}`);
    return body;
  }
}

/** The fake clone's discovered docs — the run reads only what the walker lists (like getDoc / agentDocs). */
const docWalker = { listMarkdown: async () => Object.keys(FILES).sort() };

/** Review-call recorder; `onFirstReview` runs inside the first review call (mid-run edits). */
class RecordingLLM extends MockLLMProvider {
  reviewUsers: string[] = [];
  onFirstReview?: () => Promise<void>;
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    if (req.schemaName === 'Review') {
      const first = this.reviewUsers.length === 0;
      this.reviewUsers.push(req.messages.map((m) => String(m.content)).join('\n'));
      if (first && this.onFirstReview) await this.onFirstReview();
    }
    return super.completeStructured(req);
  }
}

const docOrder = (user: string, paths: string[]) => paths.map((p) => user.indexOf(`File: ${p}`));

d('project context in review runs (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(llm: RecordingLLM) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        secrets: new MockSecretsProvider(),
        git: new FakeGit({ diff: DIFF }),
        docWalker,
        llm: { openai: llm, openrouter: new MockLLMProvider('openai', { structured: {} }) },
      },
    });
  }

  async function setup(opts: { cloned?: boolean } = {}) {
    const n = seq++;
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: `ctx-run-${n}`,
        fullName: `acme/ctx-run-${n}`,
        clonePath: opts.cloned === false ? null : `/clones/ctx-run-${n}`,
      })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId, repoId: repo!.id, number: 100 + n, title: 'Ctx', author: 'a', branch: 'feat/ctx',
        base: 'main', headSha: `sha-${n}`,
      })
      .returning();
    const [agent] = await db
      .insert(t.agents)
      .values({
        workspaceId, name: `Ctx Agent ${n}`, provider: 'openai', model: 'gpt-4.1', systemPrompt: 'review',
        strategy: 'map-reduce', repoIntel: false,
      })
      .returning();
    return { repoId: repo!.id, prId: pr!.id, agentId: agent!.id };
  }

  async function run(app: Awaited<ReturnType<typeof appWith>>, prId: string, agentId: string, expected = 1) {
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } });
    expect(res.statusCode).toBeLessThan(300);
    const runId = (res.json() as { runs: { run_id: string }[] }).runs[0]!.run_id;
    const runs = await waitForPrRuns(pg.handle.db, prId, { expected });
    const trace = (await app.inject({ url: `/runs/${runId}/trace` })).json();
    return { status: runs.find((r) => r.id === runId)?.status, trace };
  }

  it('AC-8: every model call of a map-reduce run carries the attached docs, in order, untrusted-wrapped', async () => {
    const llm = new RecordingLLM('openai', { structuredBySchema: { Review: REVIEW } });
    const app = await appWith(llm);
    const { repoId, prId, agentId } = await setup();
    await app.container.contextRepo.replaceAttachments(agentId, repoId, ['docs/b.md', 'docs/a.md']);

    const { status, trace } = await run(app, prId, agentId);

    expect(status).toBe('done');
    expect(llm.reviewUsers).toHaveLength(2);
    for (const user of llm.reviewUsers) {
      expect(user).toContain('## Project context');
      expect(user).toContain(`<untrusted source="spec-0">\nFile: docs/b.md`);
      expect(user).toContain(`<untrusted source="spec-1">\nFile: docs/a.md`);
      const [b, a] = docOrder(user, ['docs/b.md', 'docs/a.md']);
      expect(b).toBeGreaterThan(-1);
      expect(a).toBeGreaterThan(b!);
    }
    expect(trace.specs_read).toEqual(['docs/b.md', 'docs/a.md']);
    expect(trace.project_context.status).toBe('ok');
    await app.close();
  });

  it('AC-9/10: trace lists included, too-large and missing docs and the PR-changed doc; the run is done', async () => {
    const llm = new RecordingLLM('openai', { structuredBySchema: { Review: REVIEW } });
    const app = await appWith(llm);
    const { repoId, prId, agentId } = await setup();
    await app.container.contextRepo.replaceAttachments(agentId, repoId, ['docs/a.md', 'specs/big.md', 'docs/gone.md']);

    const { status, trace } = await run(app, prId, agentId);

    expect(status).toBe('done');
    const pc = trace.project_context;
    expect(pc.status).toBe('ok');
    expect(pc.cap_tokens).toBe(4000);
    expect(pc.included.map((x: { path: string }) => x.path)).toEqual(['docs/a.md']);
    expect(pc.left_out).toEqual([
      { path: 'specs/big.md', tokens: 5000, reason: 'too_large' },
      { path: 'docs/gone.md', tokens: null, reason: 'missing' },
    ]);
    expect(pc.changed_by_pr).toEqual(['docs/a.md']);
    for (const user of llm.reviewUsers) {
      expect(user).not.toContain('BBBBBBBBBB'); // the too-large doc is never sent, not even truncated
    }
    const log = trace.log.map((l: { msg: string }) => l.msg);
    expect(log).toContain('Project context: 1 of 3 doc(s) included (~11 tokens); 2 left out');
    await app.close();
  });

  it('AC-11: an agent with no attachments for the repo gets no project-context section and no trace key', async () => {
    const llm = new RecordingLLM('openai', { structuredBySchema: { Review: REVIEW } });
    const app = await appWith(llm);
    const { prId, agentId } = await setup();

    const { status, trace } = await run(app, prId, agentId);

    expect(status).toBe('done');
    expect(llm.reviewUsers.length).toBeGreaterThan(0);
    for (const user of llm.reviewUsers) expect(user).not.toContain('## Project context');
    expect('project_context' in trace).toBe(false);
    expect(trace.specs_read).toEqual([]);
    await app.close();
  });

  it('repo without a clone: the run is done and the trace says project context is unavailable', async () => {
    const llm = new RecordingLLM('openai', { structuredBySchema: { Review: REVIEW } });
    const app = await appWith(llm);
    const { repoId, prId, agentId } = await setup({ cloned: false });
    await app.container.contextRepo.replaceAttachments(agentId, repoId, ['docs/a.md']);

    const { status, trace } = await run(app, prId, agentId);

    expect(status).toBe('done');
    expect(trace.project_context).toEqual({ status: 'unavailable', reason: 'repo_not_synced', attached: ['docs/a.md'] });
    expect(trace.log.map((l: { msg: string }) => l.msg)).toContain('project context unavailable: repo not synced');
    for (const user of llm.reviewUsers) expect(user).not.toContain('## Project context');
    await app.close();
  });

  it('AC-12: attachments changed during a run apply to the NEXT run only', async () => {
    const llm = new RecordingLLM('openai', { structuredBySchema: { Review: REVIEW } });
    const app = await appWith(llm);
    const { repoId, prId, agentId } = await setup();
    await app.container.contextRepo.replaceAttachments(agentId, repoId, ['docs/a.md']);
    llm.onFirstReview = () => app.container.contextRepo.replaceAttachments(agentId, repoId, ['docs/new.md']);

    await run(app, prId, agentId, 1);
    expect(llm.reviewUsers).toHaveLength(2);
    for (const user of llm.reviewUsers) {
      expect(user).toContain('File: docs/a.md');
      expect(user).not.toContain('File: docs/new.md');
    }

    llm.reviewUsers = [];
    llm.onFirstReview = undefined;
    await run(app, prId, agentId, 2);
    expect(llm.reviewUsers.length).toBeGreaterThan(0);
    for (const user of llm.reviewUsers) {
      expect(user).toContain('File: docs/new.md');
      expect(user).not.toContain('File: docs/a.md');
    }
    await app.close();
  });

  it('AC-13: another workspace’s attachments are never injected', async () => {
    const llm = new RecordingLLM('openai', { structuredBySchema: { Review: REVIEW } });
    const app = await appWith(llm);
    const { repoId, prId, agentId } = await setup();
    const db = pg.handle.db;
    const [ws2] = await db.insert(t.workspaces).values({ name: 'other-ws' }).returning();
    const [otherAgent] = await db
      .insert(t.agents)
      .values({ workspaceId: ws2!.id, name: 'Other', provider: 'openai', model: 'gpt-4.1', systemPrompt: 'x' })
      .returning();
    await db.insert(t.agentContextDocs).values({ agentId: otherAgent!.id, repoId, path: 'docs/evil.md', position: 0 });
    await app.container.contextRepo.replaceAttachments(agentId, repoId, ['docs/a.md']);

    const { trace } = await run(app, prId, agentId);

    for (const user of llm.reviewUsers) {
      expect(user).toContain('File: docs/a.md');
      expect(user).not.toContain('DOC-EVIL');
    }
    expect(trace.specs_read).toEqual(['docs/a.md']);
    await app.close();
  });
});
