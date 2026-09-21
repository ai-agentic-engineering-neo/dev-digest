import { describe, it, expect } from 'vitest';
import { diffLines } from './prompt-diff.js';

describe('diffLines — AC-34', () => {
  it('returns all context lines for identical text', () => {
    const result = diffLines('a\nb\nc', 'a\nb\nc');
    expect(result.every((l) => l.kind === 'context')).toBe(true);
    expect(result.map((l) => l.text)).toEqual(['a', 'b', 'c']);
  });

  it('distinguishes added from removed lines', () => {
    const result = diffLines('a\nb\nc', 'a\nx\nc');
    expect(result).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'added', text: 'x' },
      { kind: 'context', text: 'c' },
    ]);
  });

  it('handles a pure addition', () => {
    const result = diffLines('a\nb', 'a\nb\nc');
    expect(result).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'context', text: 'b' },
      { kind: 'added', text: 'c' },
    ]);
  });

  it('handles a pure removal', () => {
    const result = diffLines('a\nb\nc', 'a\nc');
    expect(result).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'context', text: 'c' },
    ]);
  });

  it('handles completely disjoint text (all removed then all added)', () => {
    const result = diffLines('one', 'two');
    expect(result).toEqual([
      { kind: 'removed', text: 'one' },
      { kind: 'added', text: 'two' },
    ]);
  });
});
