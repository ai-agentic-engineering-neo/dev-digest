import { describe, it, expect } from 'vitest';
import type { Agent } from '@devdigest/shared';
import { toAgentListItem } from '../src/modules/agents/helpers.js';

const agent: Agent = {
  id: 'a1',
  name: 'Agent',
  description: 'd',
  provider: 'openai',
  model: 'gpt-4o-mini',
  system_prompt: 'p',
  output_schema: null,
  enabled: true,
  version: 1,
  strategy: 'single-pass',
  ci_fail_on: 'critical',
  repo_intel: true,
};

describe('toAgentListItem', () => {
  it('keeps every Agent field and adds the grid stats', () => {
    const item = toAgentListItem(agent, {
      skillCount: 4,
      runs: 17,
      accepted: 1,
      decided: 2,
      avgCostUsd: 0.0134,
    });
    expect(item).toEqual({
      ...agent,
      skill_count: 4,
      runs: 17,
      accept_rate: 50,
      avg_cost_usd: 0.0134,
    });
  });

  it('accept_rate is null when nothing was decided (no divide-by-zero)', () => {
    const item = toAgentListItem(agent, {
      skillCount: 0,
      runs: 3,
      accepted: 0,
      decided: 0,
      avgCostUsd: null,
    });
    expect(item.accept_rate).toBeNull();
    expect(item.avg_cost_usd).toBeNull();
    expect(item.runs).toBe(3);
  });

  it('a missing stats entry reads as zeros / null', () => {
    expect(toAgentListItem(agent, undefined)).toMatchObject({
      skill_count: 0,
      runs: 0,
      accept_rate: null,
      avg_cost_usd: null,
    });
  });

  it('rounds accept_rate to one decimal (1 of 3 → 33.3)', () => {
    const item = toAgentListItem(agent, {
      skillCount: 0,
      runs: 1,
      accepted: 1,
      decided: 3,
      avgCostUsd: null,
    });
    expect(item.accept_rate).toBe(33.3);
  });
});
