/**
 * M2 skill rules: what counts as a content change (only those write a
 * version), and the note a restore writes.
 */
import { describe, it, expect } from 'vitest';
import { isContentChange, restoreNote, type SkillContent } from '../src/modules/skills/domain.js';

const stored: SkillContent = {
  name: 'no-then-chains',
  description: 'Flag promise .then() chains; prefer async/await.',
  type: 'convention',
  body: 'Prefer async/await.',
};

describe('isContentChange', () => {
  it('a changed body is a content change', () => {
    expect(isContentChange(stored, { body: 'Prefer async/await everywhere.' })).toBe(true);
  });

  it('an enabled-only toggle and same-value patches are not', () => {
    expect(isContentChange(stored, { enabled: false })).toBe(false);
    expect(isContentChange(stored, { ...stored, enabled: true })).toBe(false);
  });
});

describe('restoreNote', () => {
  it('names the restored version', () => {
    expect(restoreNote(1)).toBe('Restored from v1');
  });
});
