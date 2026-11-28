/**
 * Agent versioning rule (`modules/agents/domain.ts`): which patches count as a
 * config change and therefore bump the version. Pure — no store, no app.
 */
import { describe, it, expect } from 'vitest';
import type { Agent } from '@devdigest/shared';
import { isConfigChange } from '../src/modules/agents/domain.js';

const agent: Agent = {
  id: 'a1',
  name: 'Security',
  description: '',
  provider: 'openai',
  model: 'gpt-4o-mini',
  system_prompt: 'Review for security issues.',
  output_schema: null,
  enabled: true,
  version: 3,
  strategy: 'single-pass',
  ci_fail_on: 'never',
  repo_intel: true,
  skill_count: 0,
};

describe('isConfigChange', () => {
  it('ignores toggling enabled and patches that repeat the stored values', () => {
    expect(isConfigChange(agent, { enabled: false })).toBe(false);
    expect(isConfigChange(agent, { model: 'gpt-4o-mini', systemPrompt: agent.system_prompt })).toBe(false);
  });

  it('counts any changed config field, and any output schema at all', () => {
    expect(isConfigChange(agent, { model: 'gpt-4o' })).toBe(true);
    expect(isConfigChange(agent, { repoIntel: false })).toBe(true);
    expect(isConfigChange(agent, { outputSchema: null })).toBe(true);
  });
});
