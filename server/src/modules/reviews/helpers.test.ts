import { describe, expect, it } from 'vitest';
import { skillsPromptArg } from './helpers.js';
import { assemblePrompt } from '../../platform/prompt.js';
import { TEST_QUALITY_SKILL_BODIES } from '../../db/seed-skills.js';

describe('skillsPromptArg', () => {
  it('wraps a non-empty list', () => {
    expect(skillsPromptArg(['a'])).toEqual({ skills: ['a'] });
  });

  it('omits the key when empty', () => {
    expect(skillsPromptArg([])).toEqual({});
  });

  it('spreads Test Quality bodies into assemblePrompt and omits an empty list', () => {
    const on = assemblePrompt({
      system: 's',
      ...skillsPromptArg(TEST_QUALITY_SKILL_BODIES),
      diff: '+ expect(parseAmount("42")).toBe(42)',
    });
    expect(on.assembly.skills).toContain(TEST_QUALITY_SKILL_BODIES[0]);
    expect(on.messages[1]!.content).toContain('## Skills / rules');

    const off = assemblePrompt({ system: 's', ...skillsPromptArg([]), diff: 'd' });
    expect(off.assembly.skills).toBeNull();
  });
});
