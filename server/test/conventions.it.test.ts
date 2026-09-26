import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import type { ConventionCandidate, ConventionExtractResult } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

/**
 * L02 conventions — the scan end to end: the evidence gate drops what the model
 * invents, a re-scan preserves the user's decisions, and an edited candidate
 * reaches a real skill through the draft.
 */
d('conventions module', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;

  const USER_TS = [
    'import { z } from "zod";',
    '',
    'export const UserSchema = z.object({',
    '  id: z.string().uuid(),',
    '});',
  ].join('\n');

  const FILES: Record<string, string> = {
    'package.json': '{\n  "name": "payments-api",\n  "type": "module"\n}',
    'src/user.ts': USER_TS,
  };

  /** One grounded candidate, one citing a file we never sampled, one invented snippet. */
  const EXTRACTION = {
    candidates: [
      {
        rule: 'Validate request bodies with a Zod schema.',
        rationale: 'Every public shape is parsed at the edge.',
        evidence_path: 'src/user.ts',
        evidence_line: 3,
        evidence_snippet: 'export const UserSchema = z.object({',
        category: 'typing',
        occurrences: 4,
        confidence: 0.9,
      },
      {
        rule: 'Name every controller with a Controller suffix.',
        rationale: 'Invented — cites a file that was never sampled.',
        evidence_path: 'src/http/controller.ts',
        evidence_line: 10,
        evidence_snippet: 'export class UserController {}',
        category: 'naming',
        occurrences: 3,
        confidence: 0.8,
      },
      {
        rule: 'Throw typed errors instead of strings.',
        rationale: 'Invented — the snippet is not in the cited file.',
        evidence_path: 'src/user.ts',
        evidence_line: 2,
        evidence_snippet: 'throw new NotFoundError("user");',
        category: 'errors',
        occurrences: 2,
        confidence: 0.7,
      },
    ],
  };

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
    repoId = repo!.id;
    // The service refuses a repo that was never cloned; the seed leaves it null.
    await pg.handle.db
      .update(t.repos)
      .set({ clonePath: '/mock/clones/acme/payments-api' })
      .where(eq(t.repos.id, repoId));
  });

  afterAll(async () => {
    await pg?.stop();
  });

  beforeEach(async () => {
    await pg.handle.db.delete(t.conventions).where(eq(t.conventions.workspaceId, workspaceId));
  });

  function makeApp(extraction: unknown = EXTRACTION) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    // Only `getConventionSamples` is on the path under test; the rest of the
    // facade is never reached, so a partial stub keeps the test readable.
    const repoIntel = {
      getConventionSamples: async () => ['src/user.ts'],
    } as unknown as RepoIntel;
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: FILES }),
        github: new MockGitHubClient(),
        repoIntel,
        llm: {
          openai: new MockLLMProvider('openai', {
            structuredBySchema: { ConventionExtraction: extraction },
          }),
        },
      },
    });
  }

  async function extract(app: Awaited<ReturnType<typeof makeApp>>) {
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(res.statusCode).toBe(200);
    return res.json() as ConventionExtractResult;
  }

  // ---- the evidence gate --------------------------------------------------

  it('keeps only the grounded candidate and counts what the gate dropped', async () => {
    const app = await makeApp();
    const out = await extract(app);

    expect(out.proposed).toBe(3);
    expect(out.dropped_ungrounded).toBe(2);
    expect(out.candidates).toHaveLength(1);

    const kept = out.candidates[0]!;
    expect(kept.rule).toBe('Validate request bodies with a Zod schema.');
    expect(kept.evidence_path).toBe('src/user.ts');
    expect(kept.evidence_line).toBe(3);
    expect(kept.evidence_snippet).toBe('export const UserSchema = z.object({');
    expect(kept.status).toBe('pending');
    expect(out.sampled_files).toBeGreaterThanOrEqual(2);
  });

  it('reports the model it used and what the call cost', async () => {
    const app = await makeApp();
    const out = await extract(app);
    expect(out.model).toBeTruthy();
    expect(out.cost_usd).toBeGreaterThan(0);
  });

  it('lists the stored candidates for the repo', async () => {
    const app = await makeApp();
    await extract(app);
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(res.statusCode).toBe(200);
    expect((res.json() as ConventionCandidate[])).toHaveLength(1);
  });

  // ---- triage -------------------------------------------------------------

  it('a re-scan replaces pending rows but never re-litigates a decision', async () => {
    const app = await makeApp();
    const first = await extract(app);
    const id = first.candidates[0]!.id;

    const rejected = await app.inject({
      method: 'PATCH',
      url: `/conventions/${id}`,
      payload: { status: 'rejected' },
    });
    expect(rejected.statusCode).toBe(200);

    const second = await extract(app);
    // The same rule comes back from the model and is deduped against the
    // rejection, so the board still holds exactly the one decided row.
    expect(second.dropped_duplicate).toBe(1);
    expect(second.candidates).toHaveLength(1);
    expect(second.candidates[0]!.id).toBe(id);
    expect(second.candidates[0]!.status).toBe('rejected');
  });

  it('edits a rule and its rationale', async () => {
    const app = await makeApp();
    const { candidates } = await extract(app);
    const res = await app.inject({
      method: 'PATCH',
      url: `/conventions/${candidates[0]!.id}`,
      payload: { rule: 'Parse every request body with Zod.', rationale: null, status: 'accepted' },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json() as ConventionCandidate;
    expect(updated.rule).toBe('Parse every request body with Zod.');
    expect(updated.rationale).toBeNull();
    expect(updated.status).toBe('accepted');
  });

  it('deletes a candidate', async () => {
    const app = await makeApp();
    const { candidates } = await extract(app);
    const del = await app.inject({ method: 'DELETE', url: `/conventions/${candidates[0]!.id}` });
    expect(del.statusCode).toBe(204);
    const again = await app.inject({ method: 'DELETE', url: `/conventions/${candidates[0]!.id}` });
    expect(again.statusCode).toBe(404);
  });

  // ---- draft → skill ------------------------------------------------------

  it('builds a draft from the selected candidates and persists nothing until POST /skills', async () => {
    const app = await makeApp();
    const { candidates } = await extract(app);
    const id = candidates[0]!.id;

    const draftRes = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { convention_ids: [id] },
    });
    expect(draftRes.statusCode).toBe(200);
    const draft = draftRes.json() as {
      name: string;
      description: string;
      type: string;
      body: string;
      evidence_files: string[];
    };
    expect(draft.name).toBe('payments-api-conventions');
    expect(draft.type).toBe('convention');
    expect(draft.body).toContain('Validate request bodies with a Zod schema.');
    expect(draft.body).toContain('Detected in `src/user.ts:3`:');
    expect(draft.evidence_files).toEqual(['src/user.ts']);

    const before = await app.inject({ method: 'GET', url: '/skills' });
    expect((before.json() as { name: string }[]).some((s) => s.name === draft.name)).toBe(false);

    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: draft.name,
        description: draft.description,
        type: draft.type,
        source: 'extracted',
        body: draft.body,
      },
    });
    expect(created.statusCode).toBe(201);
    expect((created.json() as { source: string }).source).toBe('extracted');
  });

  it('422s when nothing is selected for the draft', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { convention_ids: [] },
    });
    expect(res.statusCode).toBe(422);
  });

  // ---- refusals -----------------------------------------------------------

  it('422s before any model call when the repo has nothing to sample', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const llm = new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: EXTRACTION } });
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: {} }),
        github: new MockGitHubClient(),
        repoIntel: { getConventionSamples: async () => [] } as unknown as RepoIntel,
        llm: { openai: llm },
      },
    });
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(422);
    expect(llm.calls).toHaveLength(0);
  });

  // WP10 — `requireRepo` backs both routes; a missing/foreign repo row is a
  // 404 (NotFoundError), matching how the rest of this module 404s a missing
  // convention id — never the 422 a validation failure (unclonable repo,
  // empty selection) gets.
  it('404s extract and skill-draft for an unknown repository id', async () => {
    const app = await makeApp();
    const unknownRepoId = randomUUID();

    const extractRes = await app.inject({
      method: 'POST',
      url: `/repos/${unknownRepoId}/conventions/extract`,
    });
    expect(extractRes.statusCode).toBe(404);

    // convention_ids must be non-empty to pass the route's own body schema
    // (`.min(1)`, a 422 in its own right) so this exercises `requireRepo`, not
    // that unrelated check — the id need not exist, requireRepo runs first.
    const draftRes = await app.inject({
      method: 'POST',
      url: `/repos/${unknownRepoId}/conventions/skill`,
      payload: { convention_ids: [randomUUID()] },
    });
    expect(draftRes.statusCode).toBe(404);
  });

  it('404s on a convention from another workspace', async () => {
    const app = await makeApp();
    const { candidates } = await extract(app);
    const [other] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-${Math.random().toString(36).slice(2, 8)}` })
      .returning();
    await pg.handle.db
      .update(t.conventions)
      .set({ workspaceId: other!.id })
      .where(eq(t.conventions.id, candidates[0]!.id));

    const res = await app.inject({
      method: 'PATCH',
      url: `/conventions/${candidates[0]!.id}`,
      payload: { status: 'accepted' },
    });
    expect(res.statusCode).toBe(404);
  });
});
