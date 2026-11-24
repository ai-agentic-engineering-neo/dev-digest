/**
 * assemblePrompt — PR description slot (the fix that was missing: the PR body
 * never reached the prompt). Pins rendering, omit-when-empty, untrusted-wrap,
 * truncation, and ordering (before the diff).
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt, INJECTION_GUARD } from '../src/prompt.js';

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

describe('assemblePrompt — ## Skills / rules', () => {
  const SKILLS = ['### Skill: A\nbody-A', '### Skill: B\nbody-B', '### Skill: C\nbody-C'];

  it('renders the section with skills in the given order (A before B before C)', () => {
    const user = userOf({ system: 'S', diff: 'DIFF', skills: SKILLS });
    expect(user).toContain('## Skills / rules');
    const a = user.indexOf('body-A');
    const b = user.indexOf('body-B');
    const c = user.indexOf('body-C');
    expect(a).toBeGreaterThan(user.indexOf('## Skills / rules'));
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  it('omits the section for an empty array and for undefined', () => {
    expect(userOf({ system: 'S', diff: 'DIFF', skills: [] })).not.toContain('## Skills / rules');
    expect(userOf({ system: 'S', diff: 'DIFF' })).not.toContain('## Skills / rules');
  });

  it('assembly.skills is null when absent and holds all bodies when present', () => {
    expect(assemblePrompt({ system: 'S', diff: 'D' }).assembly.skills).toBeNull();
    expect(assemblePrompt({ system: 'S', diff: 'D', skills: [] }).assembly.skills).toBeNull();
    const skills = assemblePrompt({ system: 'S', diff: 'D', skills: SKILLS }).assembly.skills;
    expect(skills).not.toBeNull();
    for (const s of SKILLS) expect(skills).toContain(s);
  });

  it('places skills after the PR description and before the diff', () => {
    const user = userOf({ system: 'S', diff: 'DIFF', prDescription: 'PRD', skills: SKILLS });
    expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## Skills / rules'));
    expect(user.indexOf('## Skills / rules')).toBeLessThan(user.indexOf('## Diff to review'));
  });
});

describe('INJECTION_GUARD export', () => {
  it('is the exact guard assemblePrompt appends, so standalone LLM calls can reuse it', () => {
    const [system] = assemblePrompt({ system: 'S', diff: 'D' }).messages;
    expect(system?.content).toBe(`S\n\n${INJECTION_GUARD}`);
  });
});
