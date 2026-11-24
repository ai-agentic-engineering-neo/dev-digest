import { describe, it, expect } from 'vitest';
import { formatSkillBlocks } from '../src/modules/reviews/helpers.js';
import { withPromptTokens } from '../src/platform/trace-builder.js';

const link = (name: string, order: number, enabled = true) => ({
  order,
  skill: { name, description: `${name} desc`, body: `${name} body`, enabled },
});

describe('formatSkillBlocks', () => {
  it('keeps enabled skills only, sorted by order, in the documented format', () => {
    const out = formatSkillBlocks([link('b', 2), link('off', 1, false), link('a', 0)]);
    expect(out).toEqual(['### Skill: a\na desc\n\na body', '### Skill: b\nb desc\n\nb body']);
  });
  it('returns [] when nothing is enabled', () => {
    expect(formatSkillBlocks([link('x', 0, false)])).toEqual([]);
  });
});

describe('withPromptTokens', () => {
  const tokenizer = { count: (s: string) => s.length };
  it('counts each section, 0 for absent ones, and keeps the assembly', () => {
    const a = withPromptTokens(
      { system: 'sys', skills: 'skillz', memory: null, specs: null, user: 'usr!' },
      tokenizer,
    );
    expect(a.prompt_tokens).toEqual({
      system: 3,
      skills: 6,
      memory: 0,
      specs: 0,
      callers: 0,
      repo_map: 0,
      pr_description: 0,
      user: 4,
    });
    expect(a.skills).toBe('skillz');
  });
});
