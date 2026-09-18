import { describe, expect, it } from 'vitest';
import { skillsPromptArg } from './helpers.js';

describe('skillsPromptArg', () => {
  it('wraps a non-empty list', () => {
    expect(skillsPromptArg(['a'])).toEqual({ skills: ['a'] });
  });

  it('omits the key when empty', () => {
    expect(skillsPromptArg([])).toEqual({});
  });
});
