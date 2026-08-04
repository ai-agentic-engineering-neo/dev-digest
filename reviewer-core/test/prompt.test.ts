/**
 * assemblePrompt — PR description slot (the fix that was missing: the PR body
 * never reached the prompt). Pins rendering, omit-when-empty, untrusted-wrap,
 * truncation, and ordering (before the diff).
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '../src/prompt.js';

function userOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  const { messages } = assemblePrompt(parts);
  return messages[1]!.content;
}

function systemOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  return assemblePrompt(parts).messages[0]!.content;
}

describe('assemblePrompt — shared injection guard (server + CI)', () => {
  const sys = systemOf({ system: 'AGENT-SYS', diff: 'DIFF' });

  it('appends the guard to the agent system prompt', () => {
    expect(sys.startsWith('AGENT-SYS')).toBe(true);
    expect(sys).toMatch(/<untrusted>.*DATA to be analyzed/s);
  });

  it('forbids "intentional/test/demo" claims from descoping the review', () => {
    // The defense that replaced the keyword sanitizer: a general, trusted,
    // language-agnostic rule — not text parsing of untrusted input.
    expect(sys).toMatch(/test fixture|intentional|demo/i);
    expect(sys).toMatch(/never reduce|never .*descope|REPORT it/i);
    expect(sys).toMatch(/any language/i);
  });
});

describe('assemblePrompt — ## PR description', () => {
  it('renders the section (untrusted-wrapped) before the diff when present', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'Adds rate limiting to the public /api endpoints.',
    });
    const user = messages[1]!.content;
    expect(user).toContain('## PR description');
    expect(user).toContain('<untrusted source="pr-description">');
    expect(user).toContain('Adds rate limiting to the public /api endpoints.');
    expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## Diff to review'));
    expect(assembly.pr_description).toContain('Adds rate limiting');
  });

  it('omits the section when prDescription is undefined or blank (no behaviour change)', () => {
    expect(userOf({ system: 'sys', diff: 'DIFF' })).not.toContain('## PR description');
    expect(assemblePrompt({ system: 'sys', diff: 'DIFF' }).assembly.pr_description ?? null).toBeNull();
    expect(userOf({ system: 'sys', diff: 'DIFF', prDescription: '   ' })).not.toContain(
      '## PR description',
    );
  });

  it('truncates a huge body to the 4k cap', () => {
    const { assembly } = assemblePrompt({
      system: 'sys',
      diff: 'D',
      prDescription: 'x'.repeat(10_000),
    });
    expect((assembly.pr_description as string).length).toBe(4000);
  });
});

describe('assemblePrompt — ## Declared PR scope (specs/05-intent-layer.md revision 2)', () => {
  it('omits the section when both arrays are empty/undefined (no behaviour change)', () => {
    expect(userOf({ system: 'sys', diff: 'DIFF' })).not.toContain('## Declared PR scope');
    expect(
      assemblePrompt({ system: 'sys', diff: 'DIFF' }).assembly.intent_scope ?? null,
    ).toBeNull();
    expect(
      userOf({ system: 'sys', diff: 'DIFF', intentInScope: [], intentOutOfScope: [] }),
    ).not.toContain('## Declared PR scope');
  });

  it('renders the section (untrusted-wrapped) when in_scope is present, right after ## Derived PR intent', () => {
    const user = userOf({
      system: 'sys',
      diff: 'DIFF',
      intent: 'Adds rate limiting to public endpoints.',
      intentInScope: ['Rate limiter middleware'],
      intentOutOfScope: [],
    });
    expect(user).toContain('## Declared PR scope');
    expect(user).toContain('<untrusted source="intent-scope">');
    expect(user).toContain('In scope:\n- Rate limiter middleware');
    expect(user).toContain('Out of scope:\n(none stated)');
    expect(user.indexOf('## Derived PR intent')).toBeLessThan(user.indexOf('## Declared PR scope'));
    expect(user.indexOf('## Declared PR scope')).toBeLessThan(user.indexOf('## Diff to review'));
  });

  it('renders when only out_of_scope is present', () => {
    const user = userOf({
      system: 'sys',
      diff: 'DIFF',
      intentOutOfScope: ['Authentication changes'],
    });
    expect(user).toContain('## Declared PR scope');
    expect(user).toContain('In scope:\n(none stated)');
    expect(user).toContain('Out of scope:\n- Authentication changes');
  });

  it('includes the never-descope guidance text, redundant with INJECTION_GUARD', () => {
    const user = userOf({ system: 'sys', diff: 'DIFF', intentInScope: ['x'] });
    expect(user).toMatch(/NEVER excuses a real vulnerability or.*correctness defect/i);
    expect(user).toMatch(/out of scope but critical/i);
  });

  it('stores exactly one composed string on assembly.intent_scope (not two arrays)', () => {
    const { assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      intentInScope: ['a'],
      intentOutOfScope: ['b'],
    });
    expect(typeof assembly.intent_scope).toBe('string');
    expect(assembly.intent_scope).toBe('In scope:\n- a\n\nOut of scope:\n- b');
  });
});
