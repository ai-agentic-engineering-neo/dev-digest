import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import { ReviewService } from '../src/modules/reviews/service.js';
import type { Logger } from '../src/modules/reviews/run-executor.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

/**
 * L03 — the payoff for WP5 (review run wiring) + WP6 (intent classifier
 * prompt logging): drives a real review (through `ReviewService.runReview`,
 * not the route — the test brief's seam) with a capturing logger, and asserts
 * on the `'prompt: assembled'` records it produces. The core guarantee,
 * proven once per mode here: no diff / PR title / PR body / skill text ever
 * reaches ANY captured log line.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[prompt-log] Docker not available — skipping integration tests.');
}

const summaryConfig = () =>
  loadConfig({ ...process.env, NODE_ENV: 'test', PROMPT_LOG: '' } as NodeJS.ProcessEnv);
const verboseConfig = () =>
  loadConfig({ ...process.env, NODE_ENV: 'test', PROMPT_LOG: 'verbose' } as NodeJS.ProcessEnv);

const AGENT_MODEL = 'gpt-4.1';

// The diff carries two of the run's canaries: an untrusted body fragment and a
// secret-shaped literal — exactly the sort of text a prompt-log leak would expose.
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_CANARY4",
+  // CANARY_DIFF_3
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = { verdict: 'approve', summary: 'Nothing to flag.', score: 100, findings: [] };

// review_intent's registry default provider is 'openrouter' (contracts/platform.ts) —
// the classification fixture must validate against PrIntentClassificationSchema.
const CLASSIFICATION_FIXTURE = {
  evidence: ['S1: adds a stripe key to config'],
  intent: 'Add a Stripe key to the app config.',
  in_scope: ['Add stripeKey to src/config.ts'],
  out_of_scope: [],
  ambiguity: 'clear' as const,
};

const CANARIES = ['CANARY_TITLE_1', 'CANARY_BODY_2', 'CANARY_DIFF_3', 'sk_live_CANARY4', 'CANARY_SKILL_5'];

type CapturedCall = { level: 'info' | 'warn' | 'error' | 'debug'; obj: unknown; msg?: string };

function capturingLogger(): { logger: Logger; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const push = (level: CapturedCall['level']) => (obj: unknown, msg?: string) => {
    calls.push({ level, obj, msg });
  };
  return {
    logger: { info: push('info'), warn: push('warn'), error: push('error'), debug: push('debug') },
    calls,
  };
}

function llmFor(mock: MockLLMProvider) {
  return { openai: mock, openrouter: mock };
}

/**
 * `waitForPrRuns` only proves the DB row reached a terminal status — set
 * INSIDE `runOneAgent`, before it returns and `executeRuns` logs the "done"
 * line. Poll for that specific log line too, so this assertion is not a race
 * against the caller's own logging call.
 */
async function waitForCall(
  calls: CapturedCall[],
  predicate: (c: CapturedCall) => boolean,
  timeoutMs = 2000,
): Promise<CapturedCall | undefined> {
  const start = Date.now();
  for (;;) {
    const found = calls.find(predicate);
    if (found) return found;
    if (Date.now() - start > timeoutMs) return undefined;
    await new Promise((r) => setTimeout(r, 10));
  }
}

d('prompt logging (WP5 review wiring + WP6 intent classifier)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(llm: MockLLMProvider, config: AppConfig) {
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: llmFor(llm),
      },
    });
  }

  /** Fresh PR (title/body carrying canaries) + agent (+ optional enabled skill). */
  async function setupPrAndAgent(
    app: Awaited<ReturnType<typeof appWith>>,
    opts: { withSkill?: boolean } = {},
  ) {
    const db = pg.handle.db;
    const name = `prompt-log-${repoSeq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 482,
        title: 'CANARY_TITLE_1',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'CANARY_BODY_2 explains why this change is needed.',
      })
      .returning();
    await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 2,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_CANARY4",\n   redisUrl: x,',
    });

    const agentRes = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Reviewer-${repoSeq}`,
        provider: 'openai',
        model: AGENT_MODEL,
        system_prompt: 'You are a reviewer.',
      },
    });
    const agent = agentRes.json() as { id: string };

    if (opts.withSkill) {
      const skillRes = await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: 'rate-limit-rules',
          description: 'rate-limit-rules',
          type: 'custom',
          body: 'CANARY_SKILL_5',
          enabled: true,
        },
      });
      const skill = skillRes.json() as { id: string };
      await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/skills`,
        payload: { skills: [{ skill_id: skill.id }] },
      });
    }

    const agentRow = await app.container.agentsRepo.getById(workspaceId, agent.id);
    if (!agentRow) throw new Error('expected the just-created agent row to exist');
    return { pr: pr!, agentRow };
  }

  function newLlm() {
    return new MockLLMProvider('openai', {
      structuredBySchema: { Review: REVIEW_FIXTURE, PrIntentClassification: CLASSIFICATION_FIXTURE },
    });
  }

  it('summary: exactly one feature:"review" scope:"run" record per agent run, text-free', async () => {
    const llm = newLlm();
    const app = await appWith(llm, summaryConfig());
    const { pr, agentRow } = await setupPrAndAgent(app);
    const { logger, calls } = capturingLogger();

    const { runs } = await new ReviewService(app.container).runReview(workspaceId, pr.id, [agentRow], logger);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const reviewPromptCalls = calls.filter(
      (c) => c.msg === 'prompt: assembled' && (c.obj as { feature?: string }).feature === 'review',
    );
    expect(reviewPromptCalls).toHaveLength(1);
    const rec = reviewPromptCalls[0]!.obj as Record<string, unknown>;
    expect(rec.correlation_id).toBe(runs[0]!.run_id);
    expect(rec.run_id).toBe(runs[0]!.run_id);
    expect(rec.pr_id).toBe(pr.id);
    expect(rec.provider).toBe('openai');
    expect(rec.model).toBe(AGENT_MODEL);
    expect(rec.scope).toBe('run');
    expect(rec).not.toHaveProperty('skills');
    expect(rec).not.toHaveProperty('diff_files');

    await app.close();
  });

  it('the "done" line carries the numeric tokensIn/tokensOut the mock LLM reported', async () => {
    const llm = newLlm();
    const app = await appWith(llm, summaryConfig());
    const { pr, agentRow } = await setupPrAndAgent(app);
    const { logger, calls } = capturingLogger();

    await new ReviewService(app.container).runReview(workspaceId, pr.id, [agentRow], logger);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const doneCall = await waitForCall(calls, (c) => !!c.msg?.includes(' done — '));
    expect(doneCall).toBeDefined();
    const obj = doneCall!.obj as Record<string, unknown>;
    // MockLLMProvider.completeStructured always reports tokensIn:100, tokensOut:50.
    expect(obj.tokensIn).toBe(100);
    expect(obj.tokensOut).toBe(50);

    await app.close();
  });

  it('verbose: adds skills, diff_files, and a 12-hex fingerprint on every section', async () => {
    const llm = newLlm();
    const app = await appWith(llm, verboseConfig());
    const { pr, agentRow } = await setupPrAndAgent(app, { withSkill: true });
    const { logger, calls } = capturingLogger();

    await new ReviewService(app.container).runReview(workspaceId, pr.id, [agentRow], logger);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const rec = calls.find(
      (c) => c.msg === 'prompt: assembled' && (c.obj as { feature?: string }).feature === 'review',
    )!.obj as Record<string, unknown>;

    expect(rec.skills).toEqual(['rate-limit-rules']);
    const diffFiles = rec.diff_files as { path: string; chars: number }[];
    expect(diffFiles[0]!.path).toBe('src/config.ts');
    expect(diffFiles[0]!.chars).toBeGreaterThan(0);
    for (const s of rec.sections as { fingerprint?: string }[]) {
      expect(s.fingerprint).toMatch(/^[0-9a-f]{12}$/);
    }

    await app.close();
  });

  it('no canary text reaches any captured log line, in either mode', async () => {
    for (const config of [summaryConfig(), verboseConfig()]) {
      const llm = newLlm();
      const app = await appWith(llm, config);
      const { pr, agentRow } = await setupPrAndAgent(app, { withSkill: true });
      const { logger, calls } = capturingLogger();

      await new ReviewService(app.container).runReview(workspaceId, pr.id, [agentRow], logger);
      await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

      const json = JSON.stringify(calls);
      for (const canary of CANARIES) {
        expect(json).not.toContain(canary);
      }

      await app.close();
    }
  });

  it('runs to completion without a logger (telemetry is optional)', async () => {
    const llm = newLlm();
    const app = await appWith(llm, summaryConfig());
    const { pr, agentRow } = await setupPrAndAgent(app);

    await new ReviewService(app.container).runReview(workspaceId, pr.id, [agentRow], undefined);
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(runs[0]!.status).toBe('done');

    await app.close();
  });

  it('review pre-work emits one feature:"intent" scope:"classifier" record, joined by correlation_id', async () => {
    const llm = newLlm();
    const app = await appWith(llm, summaryConfig());
    const { pr, agentRow } = await setupPrAndAgent(app);
    const { logger, calls } = capturingLogger();

    const { runs } = await new ReviewService(app.container).runReview(workspaceId, pr.id, [agentRow], logger);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const intentPromptCalls = calls.filter(
      (c) => c.msg === 'prompt: assembled' && (c.obj as { feature?: string }).feature === 'intent',
    );
    expect(intentPromptCalls).toHaveLength(1);
    const rec = intentPromptCalls[0]!.obj as Record<string, unknown>;
    expect(rec.scope).toBe('classifier');
    expect(rec.run_ids).toEqual([runs[0]!.run_id]);
    expect(rec.provider).toBe('openrouter');
    expect(rec.correlation_id).toMatch(new RegExp(`^intent:${pr.id}:`));
    for (const s of rec.sections as { ref?: unknown }[]) {
      expect(s).not.toHaveProperty('ref'); // summary mode
    }

    const derivedCall = calls.find((c) => c.msg === 'intent: derived');
    expect(derivedCall).toBeDefined();
    expect((derivedCall!.obj as Record<string, unknown>).correlation_id).toBe(rec.correlation_id);

    await app.close();
  });

  it('a cached derive (unchanged PR) emits no new intent prompt record', async () => {
    const llm = newLlm();
    const app = await appWith(llm, summaryConfig());
    const { pr, agentRow } = await setupPrAndAgent(app);

    const first = capturingLogger();
    await new ReviewService(app.container).runReview(workspaceId, pr.id, [agentRow], first.logger);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const firstIntent = first.calls.filter(
      (c) => c.msg === 'prompt: assembled' && (c.obj as { feature?: string }).feature === 'intent',
    );
    expect(firstIntent).toHaveLength(1);
    const firstCorrelationId = (firstIntent[0]!.obj as Record<string, unknown>).correlation_id;

    const second = capturingLogger();
    await new ReviewService(app.container).runReview(workspaceId, pr.id, [agentRow], second.logger);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const secondIntent = second.calls.filter(
      (c) => c.msg === 'prompt: assembled' && (c.obj as { feature?: string }).feature === 'intent',
    );
    expect(secondIntent).toHaveLength(0);

    const derivedCall = second.calls.find((c) => c.msg === 'intent: derived');
    expect(derivedCall).toBeDefined();
    const obj = derivedCall!.obj as Record<string, unknown>;
    expect(obj.cached).toBe(true);
    expect(obj.correlation_id).toBe(firstCorrelationId);

    await app.close();
  });
});
