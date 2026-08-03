import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '@devdigest/reviewer-core';
import type { AgentRow, PullRow } from '../src/db/rows.js';
import type { Container } from '../src/platform/container.js';
import type { ReviewRepository } from '../src/modules/reviews/repository.js';
import { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import { renderSkillBlock } from '../src/modules/skills/helpers.js';
import { taskLine } from '../src/modules/reviews/helpers.js';
import { RunLogger } from '../src/platform/run-logger.js';
import { RunBus } from '../src/platform/sse.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import type { CompletionRequest, UnifiedDiff } from '@devdigest/shared';

/**
 * L02 — skills reach the prompt (hermetic; no DB, no network).
 *
 * The feature IS this wire: before L02 the run executor threaded systemPrompt /
 * diff / callers / repoMap / prDescription into `reviewPullRequest` but never
 * `skills`, so `PromptAssembly.skills` was null on every run ever executed and
 * linking a skill to an agent changed nothing about the review.
 *
 * These tests drive the REAL `ReviewRunExecutor` (private `runOneAgent`, reached
 * via a cast so no production code is loosened for a test) with a stub LLM, and
 * assert on the messages the model actually received.
 */

// ---- fixtures --------------------------------------------------------------

const DIFF: UnifiedDiff = {
  raw: 'diff --git a/src/api.ts b/src/api.ts\n@@ -1,2 +1,3 @@\n+const stripeKey = "sk_live_1";\n',
  files: [
    {
      path: 'src/api.ts',
      additions: 1,
      deletions: 0,
      hunks: [
        {
          header: '@@ -1,2 +1,3 @@',
          newStart: 1,
          newLines: 3,
          lines: ['+const stripeKey = "sk_live_1";'],
        },
      ],
    },
  ],
} as unknown as UnifiedDiff;

const PULL = {
  id: 'pr-1',
  repoId: 'repo-1',
  number: 482,
  title: 'Add rate limiting',
  author: 'marisa.koch',
  headSha: 'a1b2c3',
  // No body → the `## PR description` section stays omitted, keeping the
  // baseline comparison below about skills and nothing else.
  body: null,
} as unknown as PullRow;

const REPO = { owner: 'acme', name: 'api' } as never;

/** repoIntel:false so callers/repoMap/rank-note never enter the prompt — the
 *  only variable across these runs is the skills block. */
const AGENT = {
  id: 'agent-1',
  name: 'Security Reviewer',
  provider: 'openai',
  model: 'gpt-4.1',
  systemPrompt: 'You review pull requests.',
  strategy: 'single-pass',
  ciFailOn: 'critical',
  repoIntel: false,
  version: 3,
} as unknown as AgentRow;

/** One row of the `agent_skills` ⋈ `skills` join, both gates explicit. */
interface SkillFixture {
  id: string;
  name: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  body: string;
  order: number;
  /** `agent_skills.enabled` — the per-agent gate. */
  agentEnabled: boolean;
  /** `skills.enabled` — the workspace/vetting gate. */
  workspaceEnabled: boolean;
}

const SKILLS: SkillFixture[] = [
  {
    id: 'skill-a',
    name: 'test-coverage-nudge',
    type: 'custom',
    body: 'BODY_ALPHA — every new branch needs a test that exercises it.',
    order: 0,
    agentEnabled: true,
    workspaceEnabled: true,
  },
  {
    id: 'skill-b',
    name: 'corner-case-checklist',
    type: 'custom',
    body: 'BODY_BRAVO — boundaries, empty/null, off-by-one, error paths.',
    order: 1,
    agentEnabled: false, // per-agent gate closed → must NOT reach the prompt
    workspaceEnabled: true,
  },
  {
    id: 'skill-c',
    name: 'secret-leakage-gate',
    type: 'security',
    body: 'BODY_CHARLIE — flag any literal that looks like a live credential.',
    order: 2,
    agentEnabled: true,
    workspaceEnabled: true,
  },
];

// ---- harness ---------------------------------------------------------------

interface Harness {
  outcome: Promise<unknown>;
  /** Messages the stub LLM received (index 0 = system, 1 = user). */
  messages: () => { role: string; content: string }[];
  recorded: { skillId: string; order: number; tokens: number }[][];
  log: string[];
}

let runSeq = 0;

/**
 * Run `runOneAgent` against stub adapters.
 *
 * `enabledSkills` here mirrors the SQL in `AgentsRepository.enabledSkills`:
 * BOTH gates must be true, ordered by the link's `order`. Modelling it in the
 * fake is what lets this stay hermetic while still covering "a disabled skill
 * does not reach the prompt".
 */
async function run(skills: SkillFixture[]): Promise<Harness> {
  const runId = `run-${++runSeq}`;
  const llm = new MockLLMProvider('openai', {
    structured: { verdict: 'approve', summary: 'Looks fine.', score: 95, findings: [] },
  });
  const recorded: { skillId: string; order: number; tokens: number }[][] = [];
  const log: string[] = [];

  const container = {
    runBus: new RunBus(),
    llm: async () => llm,
    // Real-tokenizer stand-in: deterministic, so the assertion is about WHICH
    // block was counted, not about tiktoken's exact number.
    tokenizer: { count: (text: string) => text.length },
  } as unknown as Container;

  const repo = {
    insertReview: async () => ({ id: 'review-1', score: 95 }),
    insertFindings: async () => [],
    markReviewed: async () => undefined,
    completeAgentRun: async () => undefined,
    saveRunTrace: async () => undefined,
    recordRunSkills: async (
      _runId: string,
      rows: { skillId: string; order: number; tokens: number }[],
    ) => {
      recorded.push(rows);
    },
  } as unknown as ReviewRepository;

  const agents = {
    enabledSkills: async () =>
      skills
        .filter((s) => s.agentEnabled && s.workspaceEnabled)
        .sort((a, b) => a.order - b.order)
        .map((s) => ({ id: s.id, name: s.name, type: s.type, body: s.body })),
  } as unknown as Container['agentsRepo'];

  const executor = new ReviewRunExecutor(container, repo, agents);
  const parentLog = new RunLogger(container.runBus, [runId], {
    info: (_o, m) => log.push(String(m)),
    warn: () => undefined,
    error: (_o, m) => log.push(String(m)),
    debug: (_o, m) => log.push(String(m)),
  });

  const outcome = await (
    executor as unknown as {
      runOneAgent: (
        ws: string,
        pull: PullRow,
        repo: unknown,
        diff: UnifiedDiff,
        agent: AgentRow,
        runId: string,
        log: RunLogger,
      ) => Promise<unknown>;
    }
  ).runOneAgent('ws-1', PULL, REPO, DIFF, AGENT, runId, parentLog);

  return {
    outcome: Promise.resolve(outcome),
    messages: () => {
      const call = llm.calls.find((c) => c.method === 'completeStructured');
      return (call!.req as CompletionRequest).messages as { role: string; content: string }[];
    },
    recorded,
    log,
  };
}

// ---- tests -----------------------------------------------------------------

describe('run executor → skills in the prompt', () => {
  it('injects every enabled skill, in link order, and no disabled one', async () => {
    const h = await run(SKILLS);
    const user = h.messages()[1]!.content;

    expect(user).toContain('## Skills / rules');
    expect(user).toContain('BODY_ALPHA');
    expect(user).toContain('BODY_CHARLIE');
    // Per-agent gate closed → its body must be nowhere in the prompt.
    expect(user).not.toContain('BODY_BRAVO');
    expect(user).not.toContain('corner-case-checklist');

    // Link order, not insertion or alphabetical order.
    expect(user.indexOf('BODY_ALPHA')).toBeLessThan(user.indexOf('BODY_CHARLIE'));

    // The `### Skill:` heading is what makes four skills readable as four.
    expect(user).toContain('### Skill: test-coverage-nudge (custom)');
    expect(user).toContain('### Skill: secret-leakage-gate (security)');
  });

  it('closes on EITHER gate — a workspace-disabled skill never reaches the prompt', async () => {
    const h = await run([
      { ...SKILLS[0]!, agentEnabled: true, workspaceEnabled: false },
      SKILLS[2]!,
    ]);
    const user = h.messages()[1]!.content;
    expect(user).not.toContain('BODY_ALPHA');
    expect(user).toContain('BODY_CHARLIE');
  });

  it('logs "Loaded N skill(s): …" with the injected names (the e2e assertion)', async () => {
    const h = await run(SKILLS);
    expect(h.log).toContain('Loaded 2 skill(s): test-coverage-nudge, secret-leakage-gate');
  });

  it('records one run_skills row per injected skill, tokenized from the rendered block', async () => {
    const h = await run(SKILLS);
    expect(h.recorded).toHaveLength(1);
    expect(h.recorded[0]).toEqual([
      { skillId: 'skill-a', order: 0, tokens: renderSkillBlock(SKILLS[0]!).length },
      { skillId: 'skill-c', order: 1, tokens: renderSkillBlock(SKILLS[2]!).length },
    ]);
  });

  it('a failing run_skills write does NOT fail the review (best-effort)', async () => {
    // Same harness, but the repo write rejects. The run must still complete.
    const runId = 'run-recordfail';
    const llm = new MockLLMProvider('openai', {
      structured: { verdict: 'approve', summary: 'ok', score: 95, findings: [] },
    });
    const container = {
      runBus: new RunBus(),
      llm: async () => llm,
      tokenizer: { count: (t: string) => t.length },
    } as unknown as Container;
    const repo = {
      insertReview: async () => ({ id: 'review-1', score: 95 }),
      insertFindings: async () => [],
      markReviewed: async () => undefined,
      completeAgentRun: async () => undefined,
      saveRunTrace: async () => undefined,
      recordRunSkills: async () => {
        throw new Error('run_skills write failed');
      },
    } as unknown as ReviewRepository;
    const agents = {
      enabledSkills: async () => [
        { id: 'skill-a', name: 'a', type: 'custom' as const, body: 'BODY_ALPHA' },
      ],
    } as unknown as Container['agentsRepo'];

    const executor = new ReviewRunExecutor(container, repo, agents);
    const parentLog = new RunLogger(container.runBus, [runId]);
    await expect(
      (
        executor as unknown as {
          runOneAgent: (...a: unknown[]) => Promise<unknown>;
        }
      ).runOneAgent('ws-1', PULL, REPO, DIFF, AGENT, runId, parentLog),
    ).resolves.toBeDefined();
  });
});

describe('run executor → an agent with zero enabled skills', () => {
  it('assembles PromptAssembly.skills = null and no Skills section', async () => {
    const h = await run(SKILLS.map((s) => ({ ...s, agentEnabled: false })));
    const user = h.messages()[1]!.content;
    expect(user).not.toContain('## Skills / rules');
    expect(user).not.toContain('### Skill:');

    const { assembly } = assemblePrompt({
      system: AGENT.systemPrompt,
      diff: DIFF.raw,
      task: taskLine(PULL),
    });
    expect(assembly.skills).toBeNull();
  });

  it('produces a prompt byte-identical to the pre-feature baseline', async () => {
    const h = await run([]);
    const baseline = assemblePrompt({
      system: AGENT.systemPrompt,
      diff: DIFF.raw,
      task: taskLine(PULL),
    });
    // Omit-when-empty: `skills` is not even a key on the reviewPullRequest
    // input, so the assembled messages match the pre-L02 output exactly.
    expect(h.messages()[0]!.content).toBe(baseline.messages[0]!.content);
    expect(h.messages()[1]!.content).toBe(baseline.messages[1]!.content);
  });

  it('writes no run_skills rows', async () => {
    const h = await run([]);
    expect(h.recorded).toEqual([]);
  });
});
