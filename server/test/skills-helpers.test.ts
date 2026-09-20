import { describe, it, expect } from 'vitest';
import { isBodyChange, toSkillDto } from '../src/modules/skills/helpers.js';
import type { SkillRow } from '../src/modules/skills/repository.js';

/**
 * Unit coverage for the skills module's pure helpers: the body-version-bump
 * predicate and the row → DTO mapping.
 */

const row: SkillRow = {
  id: 'skill-1',
  workspaceId: 'ws-1',
  name: 'No console.log',
  description: 'Flag stray console.log calls in production code.',
  type: 'convention',
  source: 'manual',
  body: 'Never leave a console.log in a PR.',
  enabled: true,
  version: 3,
  evidenceFiles: null,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
} as unknown as SkillRow;

describe('isBodyChange', () => {
  it('is false when the patch has no body field', () => {
    expect(isBodyChange(row, {})).toBe(false);
    expect(isBodyChange(row, { body: undefined })).toBe(false);
  });

  it('is false when the patch body equals the existing body', () => {
    expect(isBodyChange(row, { body: row.body })).toBe(false);
  });

  it('is true when the patch body differs from the existing body', () => {
    expect(isBodyChange(row, { body: 'Use the logger, not console.log.' })).toBe(true);
  });
});

describe('toSkillDto', () => {
  it('maps a row to the public Skill DTO (camelCase → snake_case, ISO timestamp)', () => {
    expect(toSkillDto(row)).toEqual({
      id: 'skill-1',
      name: 'No console.log',
      description: 'Flag stray console.log calls in production code.',
      type: 'convention',
      source: 'manual',
      body: 'Never leave a console.log in a PR.',
      enabled: true,
      version: 3,
      evidence_files: null,
      created_at: '2026-09-01T00:00:00.000Z',
    });
  });

  it('never leaks workspace_id (not part of the public DTO)', () => {
    expect(toSkillDto(row)).not.toHaveProperty('workspace_id');
  });
});
