import { describe, it, expect } from 'vitest';
import {
  MAX_SKILL_BODY_CHARS,
  SKILL_NAME_PATTERN,
  skillBodyProblem,
  skillNameProblem,
  toSkillSlug,
} from '../src/modules/_shared/skill-name.js';

describe('skillNameProblem', () => {
  it('accepts kebab-case and rejects everything else', () => {
    for (const ok of ['no-then-chains', 'a', 'v2-rules', '123']) {
      expect(skillNameProblem(ok), ok).toBeNull();
    }
    for (const bad of ['', 'No-Caps', 'snake_case', 'two  spaces', '-lead', 'trail-', 'dou--ble', 'x.md']) {
      expect(skillNameProblem(bad), bad).toMatch(/kebab-case/);
    }
  });
});

describe('skillBodyProblem', () => {
  it('rejects empty/whitespace and over-limit bodies, accepts the boundary', () => {
    expect(skillBodyProblem('')).toBe('Skill body is empty');
    expect(skillBodyProblem('  \n\t ')).toBe('Skill body is empty');
    expect(skillBodyProblem('x'.repeat(MAX_SKILL_BODY_CHARS))).toBeNull();
    expect(skillBodyProblem('x'.repeat(MAX_SKILL_BODY_CHARS + 1))).toContain(String(MAX_SKILL_BODY_CHARS));
  });
});

describe('toSkillSlug', () => {
  it('produces slugs that satisfy the name pattern', () => {
    expect(toSkillSlug('No Then Chains.md')).toBe('no-then-chains');
    expect(toSkillSlug('  __Hello, World!!.TXT')).toBe('hello-world');
    expect(toSkillSlug('rules.zip')).toBe('rules');
    const long = toSkillSlug('a'.repeat(100));
    expect(long).toHaveLength(64);
    expect(SKILL_NAME_PATTERN.test(long)).toBe(true);
  });
});
