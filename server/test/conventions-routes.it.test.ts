import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import { EXTRACTION_SCHEMA_NAME } from '../src/modules/conventions/constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions-routes] Docker not available — skipping integration tests.');
}

const FILES = {
  'src/api/users.ts': 'export async function getUser(id) {\n  const user = await db.users.find(id);\n  return user;\n}\n',
};

const EXTRACTION = {
  candidates: [
    {
      category: 'async',
      rule: 'Always use async/await instead of .then() chains',
      evidence_path: 'src/api/users.ts',
      evidence_snippet: 'const user = await db.users.find(id);',
      confidence: 0.91,
    },
    {
      category: 'errors',
      rule: 'Invented rule',
      evidence_path: 'src/api/users.ts',
      evidence_snippet: 'throw new ApiError("nope");',
      confidence: 0.7,
    },
  ],
};

/**
 * Conventions Extractor end to end over Postgres: extract (mock git + mock
 * LLM) → only grounded candidates stored → accept → skill draft → save as an
 * `extracted` skill linked to an agent → it reaches that agent's prompt skills.
 */
d('conventions routes', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [repo] = await pg.handle.db
      .update(t.repos)
      .set({ clonePath: '/mock/clones/acme/payments-api' })
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')))
      .returning();
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: FILES }),
        github: new MockGitHubClient(),
        llm: { openai: new MockLLMProvider('openai', { structuredBySchema: { [EXTRACTION_SCHEMA_NAME]: EXTRACTION } }) },
        repoIntel: { getConventionSamples: async () => ['src/api/users.ts'] } as unknown as RepoIntel,
      },
    });
  }

  it('extract → accept → draft → create skill linked to an agent', async () => {
    const app = await makeApp();
    try {
      const ex = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
      expect(ex.statusCode).toBe(200);
      const body = ex.json();
      expect(body.rejected_ungrounded).toBe(1);
      expect(body.candidates).toHaveLength(1);
      const c = body.candidates[0];
      expect(c).toMatchObject({ status: 'pending', line_start: 2, line_end: 2, evidence_path: 'src/api/users.ts' });

      const list = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
      expect(list.json()).toHaveLength(1);

      const noDraft = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions/skill-draft` });
      expect(noDraft.statusCode).toBe(422);

      const acc = await app.inject({
        method: 'PATCH',
        url: `/conventions/${c.id}`,
        payload: { status: 'accepted', rule: 'Use async/await, never .then() chains' },
      });
      expect(acc.json()).toMatchObject({ status: 'accepted', rule: 'Use async/await, never .then() chains' });

      const draft = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions/skill-draft` })).json();
      expect(draft.name).toBe('payments-api-conventions');
      expect(draft.body).toContain('Use async/await, never .then() chains');

      const [agent] = await pg.handle.db
        .select({ id: t.agents.id })
        .from(t.agents)
        .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'API Contract Reviewer')));

      const created = await app.inject({
        method: 'POST',
        url: `/repos/${repoId}/conventions/skill`,
        payload: {
          name: draft.name,
          description: draft.description,
          type: draft.type,
          body: draft.body,
          enabled: true,
          agent_id: agent!.id,
        },
      });
      expect(created.statusCode).toBe(201);
      const { skill, linked_agent_id } = created.json();
      expect(skill).toMatchObject({ source: 'extracted', evidence_files: ['src/api/users.ts'] });
      expect(linked_agent_id).toBe(agent!.id);

      const links = (await app.inject({ method: 'GET', url: `/agents/${agent!.id}/skills` })).json();
      expect(links.at(-1).skill_id).toBe(skill.id);

      // Re-scan keeps the accepted candidate.
      const again = (await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })).json();
      expect(again.candidates.filter((x: { status: string }) => x.status === 'accepted')).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it('404 for a repo outside the workspace / unknown convention; 422 for a bad id', async () => {
    const app = await makeApp();
    try {
      const missing = '00000000-0000-0000-0000-000000000000';
      expect((await app.inject({ method: 'POST', url: `/repos/${missing}/conventions/extract` })).statusCode).toBe(404);
      expect(
        (await app.inject({ method: 'PATCH', url: `/conventions/${missing}`, payload: { status: 'rejected' } }))
          .statusCode,
      ).toBe(404);
      expect((await app.inject({ method: 'GET', url: '/repos/not-a-uuid/conventions' })).statusCode).toBe(422);
    } finally {
      await app.close();
    }
  });
});
