import { describe, expect, it } from 'vitest';
import { isConfigChange } from './helpers.js';

const existing = {
  name: 'pr-quality-rubric',
  description: 'Flag low-signal PRs.',
  type: 'rubric' as const,
  body: '# Rubric\nBe brief.',
};

describe('isConfigChange', () => {
  it('is true when name, description, type, or body changes', () => {
    expect(isConfigChange(existing, { name: 'other' })).toBe(true);
    expect(isConfigChange(existing, { description: 'Do not pad findings.' })).toBe(true);
    expect(isConfigChange(existing, { type: 'custom' })).toBe(true);
    expect(isConfigChange(existing, { body: '# Rubric\nCap at 5.' })).toBe(true);
  });

  it('is false for an enabled-only patch and for a no-op config patch', () => {
    expect(isConfigChange(existing, {})).toBe(false);
    expect(isConfigChange(existing, { name: existing.name })).toBe(false);
    expect(isConfigChange(existing, { body: existing.body })).toBe(false);
  });
});
