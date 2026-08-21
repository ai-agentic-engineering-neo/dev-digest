import { describe, it, expect } from 'vitest';
import { MockLLMProvider } from '../../adapters/mocks.js';
import { EvalExecutor } from './executor.js';
import type { AgentRecord } from './ports.js';

const agent: AgentRecord = {
  id: 'agent-1',
  name: 'Security Reviewer',
  provider: 'openai',
  model: 'gpt-4o-mini',
  systemPrompt: 'Review the diff for security issues.',
  strategy: 'single-pass',
  version: 3,
};

const inputDiff =
  'diff --git a/src/config.ts b/src/config.ts\n' +
  '--- a/src/config.ts\n' +
  '+++ b/src/config.ts\n' +
  '@@ -10,3 +10,4 @@\n' +
  '   port: 3000,\n' +
  '+  stripeKey: "sk_live_xxx",\n' +
  '   redisUrl: x,';

const inputMeta = { pr_number: 491, title: 'Fix session token handling', body: 'A description.' };

function fixtureReview() {
  return {
    verdict: 'comment' as const,
    summary: 'looks fine',
    score: 80,
    findings: [
      {
        id: 'f1',
        severity: 'WARNING' as const,
        category: 'security' as const,
        title: 'Hardcoded key',
        file: 'src/config.ts',
        start_line: 12,
        end_line: 12,
        rationale: 'x',
        confidence: 0.9,
      },
    ],
  };
}

describe('EvalExecutor.runCase — AC-8, AC-9, AC-10', () => {
  it('AC-8 — executes the agent against the case frozen diff and returns grounded findings', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixtureReview() });
    const executor = new EvalExecutor();
    const result = await executor.runCase(agent, [], llm, { inputDiff, inputMeta });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.file).toBe('src/config.ts');
    expect(result.groundingKept).toBe(1);
    expect(result.groundingTotal).toBe(1);
    expect(result.tokensIn).toBeGreaterThan(0);
  });

  it('AC-9 — the assembled prompt contains no repo map, callers, intent or live PR description sections that were never supplied', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixtureReview() });
    const executor = new EvalExecutor();
    // inputMeta.body is set (frozen PR metadata IS allowed — D9), but repo
    // map/callers/intent are never even accepted as inputs by this path.
    const result = await executor.runCase(agent, [], llm, { inputDiff, inputMeta });
    expect(result.assembly.repo_map).toBeFalsy();
    expect(result.assembly.callers).toBeFalsy();
    expect(result.assembly.intent).toBeFalsy();
    expect(result.assembly.intent_scope).toBeFalsy();
    expect(result.assembly.specs).toBeFalsy();
    expect(result.assembly.memory).toBeFalsy();
  });

  it('AC-9 — the frozen PR description IS included (D9 keeps prompt parity, minus the live-only slots)', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixtureReview() });
    const executor = new EvalExecutor();
    const result = await executor.runCase(agent, [], llm, { inputDiff, inputMeta });
    expect(result.assembly.pr_description).toContain('A description.');
  });

  it('AC-10 — assembling the same case twice with no config change is byte-identical', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixtureReview() });
    const executor = new EvalExecutor();
    const a = await executor.runCase(agent, [], llm, { inputDiff, inputMeta });
    const b = await executor.runCase(agent, [], llm, { inputDiff, inputMeta });
    expect(JSON.stringify(a.assembly)).toBe(JSON.stringify(b.assembly));
  });
});
