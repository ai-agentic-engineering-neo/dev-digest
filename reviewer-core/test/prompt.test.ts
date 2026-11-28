/**
 * assemblePrompt — PR description slot (the fix that was missing: the PR body
 * never reached the prompt). Pins rendering, omit-when-empty, untrusted-wrap,
 * truncation, and ordering (before the diff).
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt, renderSkillBlock } from '../src/prompt.js';

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

describe('assemblePrompt — ## Skills (M2: system message, ordered blocks)', () => {
  const skills = [
    { name: 'untested-branches', body: 'Flag every new branch without a test.' },
    { name: 'edge-case-checklist', body: 'List boundary inputs.\n' },
  ];

  it('appends each skill as its own block after the agent prompt, in order', () => {
    const sys = systemOf({ system: 'AGENT-SYS', diff: 'DIFF', skills });
    expect(sys.startsWith('AGENT-SYS')).toBe(true);
    expect(sys).toContain('## Skills');
    const a = sys.indexOf('### Skill: untested-branches');
    const b = sys.indexOf('### Skill: edge-case-checklist');
    expect(a).toBeGreaterThan(sys.indexOf('AGENT-SYS'));
    expect(b).toBeGreaterThan(a);
  });

  it('keeps the injection guard LAST, after every skill', () => {
    const sys = systemOf({ system: 'AGENT-SYS', diff: 'DIFF', skills });
    expect(sys.indexOf('SECURITY — read carefully')).toBeGreaterThan(
      sys.indexOf('List boundary inputs.'),
    );
  });

  it('does not put skills in the user message and records them in the assembly', () => {
    const { messages, assembly } = assemblePrompt({ system: 's', diff: 'DIFF', skills });
    expect(messages[1]!.content).not.toContain('Skill:');
    expect(messages[1]!.content).not.toContain('## Skills');
    expect(assembly.skills).toBe(
      '### Skill: untested-branches\n\nFlag every new branch without a test.\n\n' +
        '### Skill: edge-case-checklist\n\nList boundary inputs.',
    );
  });

  it('omits the section entirely when no skills are enabled', () => {
    const { messages, assembly } = assemblePrompt({ system: 's', diff: 'DIFF', skills: [] });
    expect(messages[0]!.content).not.toContain('## Skills');
    expect(assembly.skills ?? null).toBeNull();
  });

  it('renderSkillBlock matches the block used in the prompt', () => {
    expect(renderSkillBlock({ name: 'x', body: '  body \n' })).toBe('### Skill: x\n\nbody');
  });
});
