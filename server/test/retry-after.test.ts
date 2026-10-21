import { describe, it, expect } from 'vitest';
import { parseRetryAfterMs } from '../src/modules/_shared/retry-after.js';

describe('parseRetryAfterMs', () => {
  it('parses delay-seconds into milliseconds', () => {
    expect(parseRetryAfterMs('120')).toBe(120_000);
  });
});
