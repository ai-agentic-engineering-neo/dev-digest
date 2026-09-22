import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type {
  ChatMessage,
  LLMProvider,
  Review,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { assemblePrompt } from '@devdigest/reviewer-core';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { taskLine } from '../src/modules/reviews/domain/prompt.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * Skills in the review run (server/specs/03-skills.md Rules §5, §10;
 * acceptance criteria 6, 7, 12): prompt blocks in link order, disabled skills
 * skipped, every map-reduce chunk carries them, agent_run_skills + trace
 * skills_used, finding attribution → findings.skill_id, and the stats built on it.
 */

const CONFIG_DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;
const TWO_FILE_DIFF = `${CONFIG_DIFF}
diff --git a/src/other.ts b/src/other.ts
--- a/src/other.ts
+++ b/src/other.ts
@@ -1,1 +1,2 @@
 export const a = 1;
+export const b = 2;`;

function finding(id: string, title: string, skill: string | null): Review['findings'][number] {
  return {
    id,
    severity: 'CRITICAL',
    category: 'security',
    title,
    file: 'src/config.ts',
    start_line: 11,
    end_line: 11,
    rationale: 'A live key is committed.',
    suggestion: 'Use an env var.',
    confidence: 0.9,
    kind: 'finding',
    skill,
  };
}

/** Records every prompt; answers per chunk via `respond`. */
class RecordingLLM implements LLMProvider {
  readonly id = 'openai' as const;
  readonly calls: ChatMessage[][] = [];
  constructor(private readonly respond: (user: string) => Review) {}

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push(req.messages);
    const usage = { tokensIn: 10, tokensOut: 5, costUsd: 0 };
    req.onUsage?.(usage);
    const review = this.respond(req.messages[1]!.content);
    return { data: req.schema.parse(review), model: req.model, ...usage, raw: JSON.stringify(review), attempts: 1 };
  }
  async listModels() {
    return [];
  }
  async complete(): Promise<never> {
    throw new Error('not used');
  }
  async embed() {
    return [];
  }
}

d('skills in review runs (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(llm: LLMProvider | undefined, diff: string, env: Record<string, string> = {}) {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test', ...env } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff }),
        github: new MockGitHubClient({ pulls: [] }),
        ...(llm ? { llm: { openai: llm } } : {}),
      },
    });
  }
  type App = Awaited<ReturnType<typeof appWith>>;

  async function setupPr() {
    const name = `skills-repo-${++seq}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 7,
        title: 'Add Stripe config',
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: 'abc123',
        status: 'needs_review',
        body: 'Adds the Stripe key.',
      })
      .returning();
    return pr!;
  }

  async function skill(app: App, name: string, enabled = true) {
    const created = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name, type: 'security', description: `Flag ${name} issues.`, body: `Rule body of ${name}.` },
      })
    ).json() as { id: string; name: string };
    if (!enabled) await app.inject({ method: 'PUT', url: `/skills/${created.id}`, payload: { enabled: false } });
    return created;
  }

  async function agent(app: App, extra: Record<string, unknown> = {}) {
    return (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: `Skilled ${++seq}`,
          provider: 'openai',
          model: 'gpt-4.1',
          system_prompt: 'Review.',
          repo_intel: false,
          ...extra,
        },
      })
    ).json() as { id: string };
  }

  async function run(app: App, prId: string, agentId: string) {
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } });
    expect(res.statusCode, res.body).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    // Wait for THIS run: the PR may already hold terminal runs (seed, earlier tests).
    for (const start = Date.now(); Date.now() - start < 10_000; ) {
      const [row] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
      if (row?.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 25));
    }
    const [row] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(row?.status, row?.error ?? '').toBe('done');
    return runId;
  }

  it('AC6 + AC12: link order, disabled skipped, every chunk, trace, attribution and stats', async () => {
    let cName = '';
    const llm = new RecordingLLM((user) => ({
      verdict: 'request_changes',
      summary: 's',
      score: 50,
      // Only the config.ts chunk has findings: one cites C, one cites a name no skill has.
      findings: user.includes('+++ b/src/config.ts')
        ? [finding('f1', 'Hardcoded key', cName), finding('f2', 'Key in source', 'not-a-linked-skill')]
        : [],
    }));
    const app = await appWith(llm, TWO_FILE_DIFF);
    const a = await skill(app, `alpha-${seq}`);
    const b = await skill(app, `bravo-${seq}`, false);
    const c = await skill(app, `charlie-${seq}`);
    cName = c.name;
    const ag = await agent(app, { strategy: 'map-reduce' });
    await app.inject({ method: 'POST', url: `/agents/${ag.id}/skills`, payload: { skill_ids: [c.id, b.id, a.id] } });
    const pr = await setupPr();

    const runId = await run(app, pr.id, ag.id);

    // Every map-reduce chunk carries both enabled skills, C before A, never B.
    expect(llm.calls).toHaveLength(2);
    for (const messages of llm.calls) {
      const user = messages[1]!.content;
      expect(user).toContain(
        `## Skills / rules\n### ${c.name}\n_Applies when:_ Flag ${c.name} issues.\n\nRule body of ${c.name}.\n\n### ${a.name}`,
      );
      expect(user).not.toContain(`### ${b.name}`);
    }

    // agent_run_skills: exact versions in prompt order.
    const attached = await pg.handle.db
      .select()
      .from(t.agentRunSkills)
      .where(eq(t.agentRunSkills.runId, runId))
      .orderBy(t.agentRunSkills.order);
    expect(attached.map((r) => [r.skillId, r.skillVersion, r.order])).toEqual([
      [c.id, 1, 0],
      [a.id, 1, 1],
    ]);

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.skills_used).toEqual([
      { id: c.id, name: c.name, version: 1 },
      { id: a.id, name: a.name, version: 1 },
    ]);
    expect(trace.prompt_assembly.skills).toContain(`### ${c.name}`);
    const logLine = trace.log.find((l: { msg: string }) => l.msg.startsWith('skills: '))?.msg;
    expect(logLine).toMatch(
      new RegExp(`^skills: 2 attached \\(${c.name} v1, ${a.name} v1\\) · ~\\d+ tokens \\(repeated in every map-reduce chunk\\)$`),
    );

    // Attribution: the cited skill resolves to its id; an unknown name is kept unresolved.
    const rows = await pg.handle.db
      .select({ id: t.findings.id, title: t.findings.title, skillId: t.findings.skillId, skillName: t.findings.skillName })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(eq(t.reviews.runId, runId));
    const byTitle = Object.fromEntries(rows.map((r) => [r.title, r]));
    expect(byTitle['Hardcoded key']).toMatchObject({ skillId: c.id, skillName: c.name });
    expect(byTitle['Key in source']).toMatchObject({ skillId: null, skillName: 'not-a-linked-skill' });
    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })).json();
    expect(reviews[0].findings.map((f: { skill: string | null }) => f.skill).sort()).toEqual(
      [c.name, 'not-a-linked-skill'].sort(),
    );

    // Stats: C was attached and cited once; A attached but never cited.
    const statsC = (await app.inject({ method: 'GET', url: `/skills/${c.id}/stats` })).json();
    expect(statsC).toMatchObject({
      runs_attached: 1,
      runs_cited: 1,
      pull_rate: 1,
      findings: 1,
      accepted: 0,
      accept_rate: null,
      by_category: [{ key: 'security', count: 1 }],
      by_severity: [{ key: 'CRITICAL', count: 1 }],
      used_by: [{ id: ag.id, name: expect.any(String), enabled: true }],
    });
    const statsA = (await app.inject({ method: 'GET', url: `/skills/${a.id}/stats` })).json();
    expect(statsA).toMatchObject({ runs_attached: 1, runs_cited: 0, pull_rate: 0, findings: 0 });
    const statsB = (await app.inject({ method: 'GET', url: `/skills/${b.id}/stats` })).json();
    expect(statsB).toMatchObject({ runs_attached: 0, pull_rate: null });

    const accepted = await app.inject({ method: 'POST', url: `/findings/${byTitle['Hardcoded key']!.id}/accept` });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().finding.skill).toBe(c.name);
    const summary = (await app.inject({ method: 'GET', url: '/skills/stats' })).json() as { skill_id: string }[];
    expect(summary.find((s) => s.skill_id === c.id)).toEqual({ skill_id: c.id, pull_rate: 1, accept_rate: 1, findings: 1 });

    // Editing C later does not rewrite what the run used.
    await app.inject({ method: 'PUT', url: `/skills/${c.id}`, payload: { body: 'New rule.' } });
    const [kept] = await pg.handle.db
      .select()
      .from(t.agentRunSkills)
      .where(and(eq(t.agentRunSkills.runId, runId), eq(t.agentRunSkills.skillId, c.id)));
    expect(kept!.skillVersion).toBe(1);
    await app.close();
  });

  it('AC7: no enabled skills → the prompt is exactly the pre-skills prompt', async () => {
    const llm = new RecordingLLM(() => ({ verdict: 'approve', summary: 'ok', score: 100, findings: [] }));
    const app = await appWith(llm, CONFIG_DIFF);
    const pr = await setupPr();
    const bare = await agent(app);
    // Linked but disabled: skipped, so this prompt must match the bare one too.
    const gated = await agent(app);
    const off = await skill(app, `offline-${seq}`, false);
    await app.inject({ method: 'POST', url: `/agents/${gated.id}/skills`, payload: { skill_ids: [off.id] } });

    const bareRun = await run(app, pr.id, bare.id);
    await run(app, pr.id, gated.id);

    const expected = assemblePrompt({
      system: 'Review.',
      diff: parseUnifiedDiff(CONFIG_DIFF).raw,
      task: taskLine(pr),
      prDescription: pr.body!,
    }).messages;
    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[0]).toEqual(expected);
    expect(llm.calls[1]).toEqual(expected);
    expect(llm.calls[0]![1]!.content).not.toContain('## Skills / rules');

    const trace = (await app.inject({ method: 'GET', url: `/runs/${bareRun}/trace` })).json();
    expect(trace.skills_used).toEqual([]);
    expect(trace.prompt_assembly.skills).toBeNull();
    expect(await pg.handle.db.select().from(t.agentRunSkills).where(eq(t.agentRunSkills.runId, bareRun))).toEqual([]);
    await app.close();
  });

  it('LLM_PROVIDER_OVERRIDE=mock on the seeded PR #482: the seeded General Reviewer cites its first skill', async () => {
    const app = await appWith(undefined, '', { LLM_PROVIDER_OVERRIDE: 'mock' });
    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.number, 482)));
    const [general] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'General Reviewer')));
    const runId = await run(app, pr!.id, general!.id);

    const [rubric] = await pg.handle.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, 'pr-quality-rubric')));
    const rows = await pg.handle.db
      .select({ skillId: t.findings.skillId, skillName: t.findings.skillName })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(eq(t.reviews.runId, runId));
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({ skillId: rubric!.id, skillName: 'pr-quality-rubric' });
    expect(rows).toContainEqual({ skillId: null, skillName: null });
    const stats = (await app.inject({ method: 'GET', url: `/skills/${rubric!.id}/stats` })).json();
    expect(stats).toMatchObject({ runs_attached: 1, runs_cited: 1, pull_rate: 1, findings: 1 });
    await app.close();
  });
});
