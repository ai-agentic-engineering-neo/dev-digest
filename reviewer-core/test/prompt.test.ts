/**
 * assemblePrompt — PR description slot (the fix that was missing: the PR body
 * never reached the prompt). Pins rendering, omit-when-empty, untrusted-wrap,
 * truncation, and ordering (before the diff).
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt, type SkillBlock } from '../src/prompt.js';

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

describe('assemblePrompt — ## Skill: <name> (SYSTEM message, not user)', () => {
  const skills: SkillBlock[] = [
    { name: 'manual-skill', body: 'MANUAL-BODY', tokens: 10, untrusted: false },
    { name: 'linked-skill', body: 'LINKED-BODY', tokens: 20, untrusted: true },
  ];

  it('renders one "## Skill: <name>" section per entry, in order, in the system message', () => {
    const { messages } = assemblePrompt({ system: 'AGENT-SYS', diff: 'DIFF', skills });
    const system = messages[0]!.content;

    expect(system).toContain('## Skill: manual-skill');
    expect(system).toContain('## Skill: linked-skill');
    // order: agent system prompt, then skills in link order, then the guard
    expect(system.indexOf('AGENT-SYS')).toBeLessThan(system.indexOf('## Skill: manual-skill'));
    expect(system.indexOf('## Skill: manual-skill')).toBeLessThan(
      system.indexOf('## Skill: linked-skill'),
    );
    expect(system.indexOf('## Skill: linked-skill')).toBeLessThan(
      system.indexOf('SECURITY — read carefully'),
    );
  });

  it('never appears in the user message', () => {
    const { messages } = assemblePrompt({ system: 'AGENT-SYS', diff: 'DIFF', skills });
    const user = messages[1]!.content;

    expect(user).not.toContain('## Skill:');
    expect(user).not.toContain('MANUAL-BODY');
    expect(user).not.toContain('LINKED-BODY');
    expect(user).not.toContain('## Skills / rules');
  });

  it('untrusted:true wraps the body in <untrusted source="skill:...">; untrusted:false does not', () => {
    const { messages } = assemblePrompt({ system: 'AGENT-SYS', diff: 'DIFF', skills });
    const system = messages[0]!.content;

    expect(system).toContain('<untrusted source="skill:linked-skill">\nLINKED-BODY\n</untrusted>');
    // the manual (trusted) skill's body is rendered bare, not inside an untrusted block
    expect(system).toContain('## Skill: manual-skill\nMANUAL-BODY');
    expect(system).not.toContain('<untrusted source="skill:manual-skill">');
  });

  it('omits all skill sections when skills is undefined or empty (no behaviour change)', () => {
    const noSkills = assemblePrompt({ system: 'AGENT-SYS', diff: 'DIFF' }).messages[0]!.content;
    const emptySkills = assemblePrompt({ system: 'AGENT-SYS', diff: 'DIFF', skills: [] }).messages[0]!
      .content;

    expect(noSkills).not.toContain('## Skill:');
    expect(emptySkills).not.toContain('## Skill:');
  });

  it('round-trips into assembly.skills as the raw SkillBlock array (for the run trace)', () => {
    const { assembly } = assemblePrompt({ system: 'AGENT-SYS', diff: 'DIFF', skills });

    expect(assembly.skills).toEqual(skills);
  });

  it('assembly.skills is null when no skills were supplied', () => {
    const { assembly } = assemblePrompt({ system: 'AGENT-SYS', diff: 'DIFF' });
    expect(assembly.skills ?? null).toBeNull();
  });
});
