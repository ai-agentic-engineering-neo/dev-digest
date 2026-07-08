import { describe, expect, it } from 'vitest';
import { SLUG_PATTERN, disambiguateSlug, slugFromName, slugify } from './slug.js';

describe('slugify', () => {
  it('produces a filesystem-safe slug matching SLUG_PATTERN (AC-6)', () => {
    expect(slugify('Security Reviewer')).toBe('security-reviewer');
    expect(SLUG_PATTERN.test(slugify('Security Reviewer'))).toBe(true);
  });

  it('is stable across repeat calls (deterministic, not persisted — Q6)', () => {
    const first = slugify('My Cool Agent!!');
    const second = slugify('My Cool Agent!!');
    expect(first).toBe(second);
    expect(SLUG_PATTERN.test(first)).toBe(true);
  });

  it('collapses punctuation/whitespace runs and trims leading/trailing hyphens', () => {
    expect(slugify('  --Weird__Name??--  ')).toBe('weird-name');
    expect(SLUG_PATTERN.test(slugify('  --Weird__Name??--  '))).toBe(true);
  });

  it('falls back to a safe default when the name normalizes to nothing usable', () => {
    const slug = slugify('!!!???');
    expect(SLUG_PATTERN.test(slug)).toBe(true);
    expect(slug.length).toBeGreaterThan(0);
  });

  it('never produces a slug starting with a hyphen even for leading-digit-free punctuation names', () => {
    const slug = slugify('---123-abc');
    expect(SLUG_PATTERN.test(slug)).toBe(true);
  });
});

describe('disambiguateSlug', () => {
  it('returns the base slug unchanged when not already used', () => {
    expect(disambiguateSlug('security-reviewer', [])).toBe('security-reviewer');
  });

  it('deterministically disambiguates collisions with -2, -3, ... (AC-6)', () => {
    const used = new Set(['security-reviewer', 'security-reviewer-2']);
    expect(disambiguateSlug('security-reviewer', used)).toBe('security-reviewer-3');
  });

  it('is deterministic: same used-set + same base always yields the same result', () => {
    const used = ['agent', 'agent-2', 'agent-4'];
    // agent-3 is free even though agent-4 is taken — smallest available N wins.
    expect(disambiguateSlug('agent', used)).toBe('agent-3');
    expect(disambiguateSlug('agent', used)).toBe('agent-3');
  });

  it('resulting disambiguated slug still matches SLUG_PATTERN', () => {
    const result = disambiguateSlug('agent', ['agent']);
    expect(SLUG_PATTERN.test(result)).toBe(true);
  });
});

describe('slugFromName', () => {
  it('slugifies and disambiguates in one call', () => {
    expect(slugFromName('Security Reviewer', ['security-reviewer'])).toBe('security-reviewer-2');
    expect(slugFromName('Security Reviewer')).toBe('security-reviewer');
  });
});
