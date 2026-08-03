import { describe, it, expect } from 'vitest';
import type { AgentRow, PullRow } from '../src/db/rows.js';
import type { Container } from '../src/platform/container.js';
import type { ReviewRepository } from '../src/modules/reviews/repository.js';
import { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import { renderSkillBlock } from '../src/modules/skills/helpers.js';
import { RunLogger } from '../src/platform/run-logger.js';
import { RunBus } from '../src/platform/sse.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import type { CompletionRequest, UnifiedDiff } from '@devdigest/shared';

/**
 * L02 — the Preview tab must never lie.
 *
 * `GET /skills/:id/preview` shows the user "exactly what will be injected", and
 * it gets that string from `renderSkillBlock`. The run executor must therefore
 * inject the output of that SAME function, character for character — no extra
 * trimming, no heading of its own, no per-call formatting. If a second renderer
 * ever appears in the executor, this test fails and the Preview tab is caught
 * before it starts describing a prompt the model never saw.
 */

const DIFF: UnifiedDiff = {
  raw: 'diff --git a/a.ts b/a.ts\n@@ -1 +1,2 @@\n+const x = 1;\n',
  files: [
    {
      path: 'a.ts',
      additions: 1,
      deletions: 0,
      hunks: [{ header: '@@ -1 +1,2 @@', newStart: 1, newLines: 2, lines: ['+const x = 1;'] }],
    },
  ],
} as unknown as UnifiedDiff;

const PULL = {
  id: 'pr-1',
  repoId: 'repo-1',
  number: 7,
  title: 'Tidy up',
  author: 'octocat',
  headSha: 'deadbee',
  body: null,
} as unknown as PullRow;

const REPO = { owner: 'acme', name: 'api' } as never;

const AGENT = {
  id: 'agent-1',
  name: 'Test Quality Reviewer',
  provider: 'openai',
  model: 'gpt-4.1',
  systemPrompt: 'You review the tests in a pull request.',
  strategy: 'single-pass',
  ciFailOn: 'critical',
  repoIntel: false,
  version: 1,
} as unknown as AgentRow;

/** Deliberately awkward bodies: leading/trailing blank lines, a fenced block,
 *  markdown headings of its own — anything the executor might be tempted to
 *  "clean up" on the way into the prompt. */
const SKILLS = [
  {
    id: 'skill-a',
    name: 'pr-quality-rubric',
    type: 'rubric' as const,
    body: '\n\n# PR Quality Rubric\n\nEvaluate against:\n- clarity\n- tests\n\n',
  },
  {
    id: 'skill-b',
    name: 'mock-discipline',
    type: 'convention' as const,
    body: 'Flag over-mocking.\n\n```ts\nvi.mock("../db"); // the unit under test\n```\n\nAnd time-dependent flakiness.',
  },
];

/** Drive the real executor and return the assembled user message. */
async function assembledUserMessage(): Promise<string> {
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
    recordRunSkills: async () => undefined,
  } as unknown as ReviewRepository;
  const agents = {
    enabledSkills: async () => SKILLS,
  } as unknown as Container['agentsRepo'];

  const executor = new ReviewRunExecutor(container, repo, agents);
  await (
    executor as unknown as { runOneAgent: (...a: unknown[]) => Promise<unknown> }
  ).runOneAgent(
    'ws-1',
    PULL,
    REPO,
    DIFF,
    AGENT,
    'run-preview-1',
    new RunLogger(container.runBus, ['run-preview-1']),
  );

  const call = llm.calls.find((c) => c.method === 'completeStructured');
  const messages = (call!.req as CompletionRequest).messages as { content: string }[];
  return messages[1]!.content;
}

describe('preview parity — the executor injects renderSkillBlock verbatim', () => {
  it('contains each skill block character-for-character', async () => {
    const user = await assembledUserMessage();
    for (const skill of SKILLS) {
      const preview = renderSkillBlock(skill);
      expect(preview).toContain(`### Skill: ${skill.name} (${skill.type})`);
      // Substring, not "contains the body": the whole rendered block — heading,
      // newline and normalized body — has to appear intact.
      expect(user).toContain(preview);
    }
  });

  it('renders the whole `## Skills / rules` section as the blocks joined by a blank line', async () => {
    const user = await assembledUserMessage();
    // assemblePrompt joins skill blocks with '\n\n' under one heading; the
    // section content must be exactly the previews, nothing interleaved.
    const expected = `## Skills / rules\n${SKILLS.map(renderSkillBlock).join('\n\n')}`;
    expect(user).toContain(expected);
  });

  it('does not re-trim, re-wrap, or re-head a skill body on the way in', async () => {
    const user = await assembledUserMessage();
    const block = renderSkillBlock(SKILLS[1]!);
    // The fenced code block survives verbatim …
    expect(block).toContain('```ts');
    expect(user).toContain('```ts\nvi.mock("../db"); // the unit under test\n```');
    // … and the skill is NOT delimiter-wrapped. Skills are instructions at the
    // same trust level as the system prompt; wrapping one as <untrusted> would
    // tell the model (via INJECTION_GUARD) to ignore it.
    expect(user).not.toContain('<untrusted source="skill');
    const idxSkills = user.indexOf('## Skills / rules');
    const idxDiff = user.indexOf('## Diff to review');
    expect(idxSkills).toBeGreaterThan(-1);
    expect(idxSkills).toBeLessThan(idxDiff);
  });
});
