import { describe, it, expect } from 'vitest';
import { promptAssemblySections, taskLine } from '../src/modules/reviews/helpers.js';

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

/**
 * specs/09-project-context-folder.md — the `specs` slot's debug source label
 * moved from the old (never-shipped) `project_specs` to
 * `project_context.documents`, now that the slot is real.
 */
describe('promptAssemblySections — specs source label', () => {
  const baseAssembly = {
    system: 'sys',
    skills: null,
    memory: null,
    specs: null,
    callers: null,
    repo_map: null,
    pr_description: null,
    intent: null,
    intent_scope: null,
    user: 'user',
  } as const;

  it('labels the specs section project_context.documents when present', () => {
    const sections = promptAssemblySections({ ...baseAssembly, specs: 'wrapped block' }, 10);
    const specsSection = sections.find((s) => s.section === 'specs');
    expect(specsSection?.source).toBe('project_context.documents');
  });

  it('omits the specs section when null (byte-identical debug view to before)', () => {
    const sections = promptAssemblySections(baseAssembly, 10);
    expect(sections.some((s) => s.section === 'specs')).toBe(false);
  });
});
