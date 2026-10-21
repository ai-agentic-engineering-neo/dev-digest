import { describe, it, expect } from 'vitest';
import { taskLine } from '../src/modules/reviews/helpers.js';

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});

import { renderSkillsForPrompt } from '../src/modules/reviews/helpers.js';

describe('renderSkillsForPrompt', () => {
  it('renders enabled skills in the given order as "### name" sections and skips disabled ones', () => {
    const out = renderSkillsForPrompt([
      { name: 'pr-quality-rubric', body: '  # Rubric\nCite lines.\n', enabled: true },
      { name: 'no-then-chains', body: 'Prefer await.', enabled: false },
      { name: 'secret-leakage-gate', body: 'Flag sk_live.', enabled: true },
    ]);
    expect(out).toEqual([
      '### pr-quality-rubric\n\n# Rubric\nCite lines.',
      '### secret-leakage-gate\n\nFlag sk_live.',
    ]);
  });

  it('returns [] when nothing is enabled so the prompt slot is omitted', () => {
    expect(renderSkillsForPrompt([])).toEqual([]);
    expect(renderSkillsForPrompt([{ name: 'x', body: 'y', enabled: false }])).toEqual([]);
  });
});
