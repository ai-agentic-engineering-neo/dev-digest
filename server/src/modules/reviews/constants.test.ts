import { describe, expect, it } from 'vitest';
import { CONFLICT_MAX_RANGE_LINES, FULL_FILE_KINDS } from './constants.js';

describe('FULL_FILE_KINDS', () => {
  it('pins the exact set duplicated from reviewer-core/src/grounding.ts:16 (module-private there, D4 forbids exporting it)', () => {
    // If reviewer-core's own FULL_FILE_KINDS ever changes, this won't update
    // itself (they're two independent literals) — that's the point: a future
    // divergence is loud here rather than silently drifting.
    expect([...FULL_FILE_KINDS].sort()).toEqual(['hook', 'lethal_trifecta', 'phantom', 'secret_leak']);
  });
});

describe('CONFLICT_MAX_RANGE_LINES', () => {
  it('ships as 50 lines (D-P1)', () => {
    expect(CONFLICT_MAX_RANGE_LINES).toBe(50);
  });
});
