import { describe, it, expect } from 'vitest';
import { formatBytes } from '../src/modules/_shared/bytes.js';

describe('formatBytes', () => {
  it('leaves sizes under a kilobyte in bytes, with no decimals', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('steps up a unit every 1024', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 ** 2)).toBe('1.0 MB');
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB');
  });

  it('stops at the largest unit instead of running off the end', () => {
    expect(formatBytes(1024 ** 5)).toBe('1024.0 TB');
  });

  it('honours the requested precision', () => {
    expect(formatBytes(1536, 0)).toBe('2 KB');
    expect(formatBytes(1536, 2)).toBe('1.50 KB');
  });

  it('rejects negative and non-finite input', () => {
    expect(() => formatBytes(-1)).toThrow(RangeError);
    expect(() => formatBytes(NaN)).toThrow(RangeError);
    expect(() => formatBytes(Infinity)).toThrow(RangeError);
  });
});
