import { describe, it, expect } from 'vitest';
import type { RunTrace } from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { RunBus } from '../src/platform/sse.js';
import type { Container } from '../src/platform/container.js';
import type { AgentRow, PullRow } from '../src/db/rows.js';
import { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import type { ReviewRepository } from '../src/modules/reviews/repository.js';
import type { PromptSkill, PromptSkillsSource } from '../src/modules/reviews/ports.js';
import { skillPromptBlocks, skillsLogLine, taskLine } from '../src/modules/reviews/helpers.js';

/**
 * M2 Task 5 — the run executor puts the agent's skills (from the
 * PromptSkillsSource port) into the prompt, in order, and logs their versions.
 * Hermetic: mock LLM + mock git, in-memory repository fake, no Postgres.
 */

const REVIEW = { verdict: 'comment', summary: 'ok', score: 95, findings: [] };

const agent = {
  id: 'agent-1',
  name: 'Security Reviewer',
  provider: 'openai',
  model: 'gpt-4.1',
  systemPrompt: 'You are a security reviewer.',
  strategy: 'single-pass',
  ciFailOn: 'critical',
  repoIntel: false, // skip enrichment → the prompt depends only on diff + PR + skills
  version: 3,
} as unknown as AgentRow;

const pull = {
  id: 'pr-1',
  repoId: 'repo-1',
  number: 482,
  title: 'Add rate limiting',
  author: 'marisa.koch',
  base: 'main',
  headSha: 'a1b2c3d4',
  body: 'Add rate limiting. Closes #471.',
} as unknown as PullRow;

const repoRow = { id: 'repo-1', owner: 'acme', name: 'payments-api' } as never;

async function runWith(skills: PromptSkill[]) {
  const llm = new MockLLMProvider('openai', { structured: REVIEW });
  const git = new MockGitClient();
  const runBus = new RunBus();
  const container = { llm: async () => llm, git, runBus } as unknown as Container;
  const traces: RunTrace[] = [];
  const repo = {
    getPrFiles: async () => [],
    insertReviewWithFindings: async () => ({ review: { id: 'rv-1' }, findings: [] }),
    markReviewed: async () => undefined,
    completeAgentRun: async () => undefined,
    saveRunTrace: async (_runId: string, trace: RunTrace) => {
      traces.push(trace);
    },
  } as unknown as ReviewRepository;
  const requested: string[] = [];
  const source: PromptSkillsSource = {
    loadPromptSkills: async (agentId) => {
      requested.push(agentId);
      return skills;
    },
  };
  const executor = new ReviewRunExecutor(container, repo, {} as Container['agentsRepo'], source);
  await executor.executeRuns('ws-1', pull, repoRow, [{ agent, runId: 'run-1' }]);
  const call = llm.calls.find((c) => c.method === 'completeStructured');
  const messages = (call?.req as { messages: { role: string; content: string }[] }).messages;
  return { messages, trace: traces.at(-1)!, requested, git };
}

/** Today's prompt: the engine called exactly as the executor did before M2 (no skills). */
async function baselineMessages(git: MockGitClient) {
  const llm = new MockLLMProvider('openai', { structured: REVIEW });
  await reviewPullRequest({
    systemPrompt: agent.systemPrompt,
    model: agent.model,
    diff: await git.diff(),
    llm,
    strategy: 'single-pass',
    prDescription: pull.body!,
    task: taskLine(pull),
    sessionId: 'acme/payments-api#482:Security Reviewer',
  });
  const call = llm.calls.find((c) => c.method === 'completeStructured');
  return (call?.req as { messages: unknown }).messages;
}

describe('ReviewRunExecutor — skills in the prompt', () => {
  const skills: PromptSkill[] = [
    { name: 'secret-leakage-gate', version: 3, body: 'Flag hard-coded secrets.' },
    { name: 'lethal-trifecta', version: 1, body: 'Flag private data + untrusted input + egress.' },
  ];

  it('passes the skills in port order under ## Skills / rules and logs their versions', async () => {
    const { messages, trace, requested } = await runWith(skills);
    expect(requested).toEqual(['agent-1']);

    const user = messages[1]!.content;
    expect(user).toContain('## Skills / rules\n### secret-leakage-gate\nFlag hard-coded secrets.');
    expect(user.indexOf('### secret-leakage-gate')).toBeLessThan(user.indexOf('### lethal-trifecta'));

    expect(trace.prompt_assembly.skills).toBe(skillPromptBlocks(skills).join('\n\n'));
    expect(trace.log.map((l) => l.msg)).toContain('Skills: secret-leakage-gate@v3, lethal-trifecta@v1');
  });

  it('keeps a reversed order reversed (the executor never re-sorts)', async () => {
    const { messages } = await runWith([...skills].reverse());
    const user = messages[1]!.content;
    expect(user.indexOf('### lethal-trifecta')).toBeLessThan(user.indexOf('### secret-leakage-gate'));
  });

  it('no skills → prompt identical to the pre-M2 prompt, log says "Skills: none"', async () => {
    const { messages, trace, git } = await runWith([]);
    expect(messages).toEqual(await baselineMessages(git));
    expect(messages[1]!.content).not.toContain('## Skills / rules');
    expect(trace.prompt_assembly.skills).toBeNull();
    expect(trace.log.map((l) => l.msg)).toContain('Skills: none');
  });
});

describe('skill prompt helpers', () => {
  it('skillPromptBlocks renders "### name\\nbody" per skill, in order', () => {
    expect(
      skillPromptBlocks([
        { name: 'a', version: 1, body: 'A' },
        { name: 'b', version: 2, body: 'B' },
      ]),
    ).toEqual(['### a\nA', '### b\nB']);
  });

  it('skillsLogLine names versions, or says none', () => {
    expect(skillsLogLine([])).toBe('Skills: none');
    expect(skillsLogLine([{ name: 'a', version: 4, body: '' }])).toBe('Skills: a@v4');
  });
});
