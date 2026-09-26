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

/**
 * L03 — prompt logging: `assemblePrompt`'s `sections` output (text-free
 * metadata per section). Per plan § Contract: push order, the untrusted flags
 * from the section-mapping table, `tokens_est = ceil(chars/4)`, no
 * `fingerprint` unless a hasher is injected.
 */
describe('assemblePrompt — L03 section metadata', () => {
  const fullParts: Parameters<typeof assemblePrompt>[0] = {
    system: 'SYS',
    task: 'T',
    prDescription: 'The PR adds a cache layer.',
    intent: {
      summary: 'Adds a cache layer',
      inScope: ['Add cache middleware'],
      outOfScope: [],
      confidence: 'high',
    },
    skills: ['skill one body', 'skill two body'],
    memory: ['remember this fact'],
    repoMap: 'repo skeleton text',
    specs: ['spec chunk one', 'spec chunk two'],
    callers: 'caller-of-changed-symbols text',
    diff: 'DIFF BODY',
  };

  it('lists every rendered section, in push order, with the documented untrusted flags', () => {
    const { sections } = assemblePrompt(fullParts);
    expect(sections.map((s) => s.name)).toEqual([
      'system_prompt',
      'injection_guard',
      'task',
      'pr_description',
      'intent',
      'skills',
      'memory',
      'repo_map',
      'specs',
      'callers',
      'diff',
    ]);
    const untrustedNames = sections.filter((s) => s.untrusted).map((s) => s.name).sort();
    expect(untrustedNames).toEqual(
      ['callers', 'diff', 'intent', 'pr_description', 'repo_map', 'specs'].sort(),
    );
    for (const s of sections) {
      expect(s).not.toHaveProperty('fingerprint');
      expect(s.tokens_est).toBe(Math.ceil(s.chars / 4));
    }
  });

  it('char totals: user sections + separators sum to the user message length; system + guard + separator sum to the system message length', () => {
    const { messages, sections } = assemblePrompt(fullParts);
    const userSections = sections.slice(2); // drop system_prompt, injection_guard
    const userSum =
      userSections.reduce((n, s) => n + s.chars, 0) + 2 * (userSections.length - 1);
    expect(userSum).toBe(messages[1]!.content.length);

    const [sysSection, guardSection] = sections;
    expect(sysSection!.chars + guardSection!.chars + 2).toBe(messages[0]!.content.length);
  });

  it('omits sections for parts that are absent (system + diff only)', () => {
    const { sections } = assemblePrompt({ system: 'SYS', diff: 'D' });
    expect(sections.map((s) => s.name)).toEqual(['system_prompt', 'injection_guard', 'diff']);
  });

  it('uses the injected fingerprint hasher for every section, keyed by the rendered text length', () => {
    const { sections } = assemblePrompt(fullParts, { fingerprint: (t) => `h${t.length}` });
    for (const s of sections) {
      expect(s.fingerprint).toBe(`h${s.chars}`);
    }
  });
});
