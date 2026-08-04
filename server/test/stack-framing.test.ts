import { describe, it, expect } from 'vitest';
import { buildStackFraming } from '../src/modules/reviews/helpers.js';

/**
 * Phase 4 (docs/go-language-support-plan.md) — per-diff system-prompt
 * framing, replacing the removed static "Node.js (TypeScript, ESM)"
 * assumption baked into the seeded prompts.
 */
describe('buildStackFraming', () => {
  it('returns undefined when no changed file maps to a known language', () => {
    expect(buildStackFraming(['README.md', 'docs/notes.txt'])).toBeUndefined();
  });

  it('returns undefined for an empty file list', () => {
    expect(buildStackFraming([])).toBeUndefined();
  });

  it('frames a TS-only diff', () => {
    const result = buildStackFraming(['src/index.ts', 'src/util.tsx']);
    expect(result).toContain('TypeScript/JavaScript');
    expect(result).not.toContain('Go');
  });

  it('frames a Go-only diff', () => {
    const result = buildStackFraming(['main.go', 'internal/util/util.go']);
    expect(result).toContain('Go');
    expect(result).not.toContain('TypeScript');
  });

  it('frames a mixed TS+Go diff with both languages', () => {
    const result = buildStackFraming(['main.go', 'src/index.ts']);
    expect(result).toContain('Go');
    expect(result).toContain('TypeScript/JavaScript');
  });

  it('ignores unrecognized files alongside recognized ones', () => {
    const result = buildStackFraming(['main.go', 'README.md']);
    expect(result).toContain('Go');
  });
});
