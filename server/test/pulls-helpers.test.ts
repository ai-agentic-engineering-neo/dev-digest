import { describe, it, expect } from 'vitest';
import { previewExcerpt, PREVIEW_LIMIT } from '../src/modules/pulls/helpers.js';

describe('pulls helpers — previewExcerpt', () => {
  it('returns the first paragraph as plain text', () => {
    expect(previewExcerpt('Line 12 contains a literal `sk_live_` key.\n\nSecond paragraph.')).toBe(
      'Line 12 contains a literal sk_live_ key.',
    );
  });
  it('strips markdown markers and collapses whitespace', () => {
    expect(previewExcerpt('**Loop**   issues *one* query\nper user')).toBe('Loop issues one query per user');
    expect(previewExcerpt('uses `sk_live_` key')).toBe('uses sk_live_ key');
  });
  it('cuts long text at a word boundary with an ellipsis', () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const out = previewExcerpt(long);
    expect(out.length).toBeLessThanOrEqual(201);
    expect(out.endsWith('…')).toBe(true);
    // never a chopped word before the ellipsis: the last token is a whole input word
    const lastToken = out.slice(0, -1).split(' ').pop();
    expect(long.split(' ')).toContain(lastToken);
  });
  it('exposes a small preview cap', () => {
    expect(PREVIEW_LIMIT).toBe(10);
  });
});
