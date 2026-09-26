import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient, MockWebFetchClient, MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { PrIntentRecord } from '@devdigest/shared';
import type { IntentPrInput } from '../src/modules/intent/service.js';

/**
 * `T018` — intent routes, integration (server/specs/intent.md, task plan
 * docs/plans/2026-09-25-intent-layer.md). Every provider the derivation can
 * reach (`github`, `git`, `webFetch`, `llm.openrouter`) is mocked so the suite
 * makes no real network or LLM call (server INSIGHTS 2026-09-26).
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** A valid `PrIntentClassification` fixture for the classifier's `completeStructured` call. */
const INTENT_FIXTURE = {
  intent: 'Add rate limiting to the public API.',
  in_scope: ['Add a rate limiting middleware'],
  out_of_scope: [],
  missing_context: [],
};

let repoSeq = 0;

d('Intent routes: GET /pulls/:id/intent, POST /pulls/:id/intent/recompute (Testcontainers pg)', () => {
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

  /** Build an app with every provider the derivation can reach mocked. */
  async function appWith(opts: {
    git?: MockGitClient;
    github?: MockGitHubClient;
    webFetch?: MockWebFetchClient;
  } = {}) {
    const openrouter = new MockLLMProvider('openai', {
      structuredBySchema: { PrIntentClassification: INTENT_FIXTURE },
    });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: opts.git ?? new MockGitClient(),
        github: opts.github ?? new MockGitHubClient(),
        webFetch: opts.webFetch ?? new MockWebFetchClient(),
        llm: { openrouter },
      },
    });
    return { app, openrouter };
  }

  async function insertRepoAndPr(
    db: PgFixture['handle']['db'],
    ws: string,
    body: string,
  ) {
    const name = `intent-repo-${repoSeq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 1,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body,
      })
      .returning();
    return { repo: repo!, pr: pr! };
  }

  it(
    'GET before derivation is the literal null; recompute derives a high-confidence record with a ' +
      'redacted unavailable web source and matching missing_context; GET then returns the same record; ' +
      'the body-derived doc path never leaves the <untrusted> block the classifier receives',
    async () => {
      const body =
        'Closes #7\n\nSee docs/plans/x.md for background, and https://example.com/notes?token=secret for more context.';
      const { pr } = await insertRepoAndPr(pg.handle.db, workspaceId, body);

      const { app, openrouter } = await appWith({
        git: new MockGitClient({ filesAt: { 'docs/plans/x.md': 'Plan: add rate limiting to the public API.' } }),
        webFetch: new MockWebFetchClient({
          responses: { 'https://example.com/notes?token=secret': new Error('blocked') },
        }),
      });

      // Step 1: nothing derived yet -> the literal JSON `null`, not an empty body.
      const before = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
      expect(before.statusCode).toBe(200);
      expect(before.payload).toBe('null');
      expect(before.json()).toBeNull();

      // Step 2: recompute.
      const recomputed = await app.inject({
        method: 'POST',
        url: `/pulls/${pr.id}/intent/recompute`,
      });
      expect(recomputed.statusCode).toBe(200);
      const record = recomputed.json();
      // The response really is a PrIntentRecord (contract-shaped).
      expect(() => PrIntentRecord.parse(record)).not.toThrow();

      // High confidence: the issue (#7) and the repo doc both resolved `ok`.
      expect(record.confidence).toBe('high');
      // Cached against the PR's actual head SHA.
      expect(record.head_sha).toBe(pr.headSha);

      // The web source failed; its ledger `ref` is redacted (origin + pathname, no query string).
      const webSource = record.sources.find((s: { kind: string }) => s.kind === 'web');
      expect(webSource).toMatchObject({ status: 'unavailable', ref: 'https://example.com/notes' });
      expect(webSource.ref).not.toContain('?');
      expect(webSource.ref).not.toContain('token');

      // missing_context names the failed source by its (redacted) ref.
      expect(record.missing_context.some((m: string) => m.includes('https://example.com/notes'))).toBe(true);

      // The classifier request: the section heading is the static "Repo doc 1"
      // (never the body-derived path), and the concrete `docs/plans/x.md`
      // reference appears ONLY inside the <untrusted> block it is wrapped in.
      const call = openrouter.calls.at(-1);
      expect(call?.method).toBe('completeStructured');
      const req = call!.req as { messages: { role: string; content: string }[] };
      const userMsg = req.messages.find((m) => m.role === 'user')!.content;
      expect(userMsg).toContain('## Repo doc 1');
      expect(userMsg).not.toContain('## docs/plans/x.md');
      // The reference sits as the first line right after an <untrusted> tag opens.
      expect(userMsg).toMatch(/<untrusted[^>]*>\s*Reference: docs\/plans\/x\.md/);
      // Outside every <untrusted>…</untrusted> block, the raw doc path never appears.
      const withoutUntrusted = userMsg.replace(/<untrusted[^>]*>[\s\S]*?<\/untrusted>/g, '');
      expect(withoutUntrusted).not.toContain('docs/plans/x.md');

      // Step 3: GET now returns the exact same persisted record.
      const after = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
      expect(after.statusCode).toBe(200);
      expect(after.json()).toEqual(record);

      await app.close();
    },
  );

  it('a PR from another workspace 404s on both GET and recompute', async () => {
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `intent-other-ws-${repoSeq++}` })
      .returning();
    const { pr } = await insertRepoAndPr(pg.handle.db, otherWs!.id, 'Some unrelated change.');

    const { app } = await appWith();

    const get = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(get.statusCode).toBe(404);
    expect(get.json()).toMatchObject({ error: { code: 'not_found' } });

    const post = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/recompute` });
    expect(post.statusCode).toBe(404);
    expect(post.json()).toMatchObject({ error: { code: 'not_found' } });

    await app.close();
  });

  it(
    'getOrDerive reuses the stored record at the same head_sha (no new completeStructured call), ' +
      'and re-derives once the head advances',
    async () => {
      // No closing keyword / doc / URL in the body: this isolates the cache
      // behaviour from the source-fetch paths already covered above.
      const { repo, pr } = await insertRepoAndPr(pg.handle.db, workspaceId, 'A small, self-contained tweak.');
      const { app, openrouter } = await appWith();

      const input = (headSha: string): IntentPrInput => ({
        id: pr.id,
        title: pr.title,
        body: pr.body,
        headSha,
        base: pr.base,
        repo: { owner: repo.owner, name: repo.name },
      });

      expect(openrouter.calls.length).toBe(0);

      const first = await app.container.intent.getOrDerive(workspaceId, input(pr.headSha), undefined);
      expect(openrouter.calls.length).toBe(1);
      expect(first.head_sha).toBe(pr.headSha);

      // Same head SHA: the stored record is reused, no new classifier call.
      const reused = await app.container.intent.getOrDerive(workspaceId, input(pr.headSha), undefined);
      expect(openrouter.calls.length).toBe(1);
      expect(reused).toEqual(first);

      // The PR's head advances: the cache no longer matches, so it re-derives.
      const newHeadSha = 'deadbeef99';
      await pg.handle.db.update(t.pullRequests).set({ headSha: newHeadSha }).where(eq(t.pullRequests.id, pr.id));

      const rederived = await app.container.intent.getOrDerive(workspaceId, input(newHeadSha), undefined);
      expect(openrouter.calls.length).toBe(2);
      expect(rederived.head_sha).toBe(newHeadSha);

      await app.close();
    },
  );
});
