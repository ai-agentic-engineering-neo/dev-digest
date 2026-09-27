import { describe, it, expect } from 'vitest';
import {
  normalizeRule,
  stripLineNumbers,
  verifyCandidates,
  verifyEvidence,
} from '../src/modules/conventions/verifier.js';
import type { ProposedCandidate } from '../src/modules/conventions/verifier.js';

/**
 * The verifier is the promise the product makes: every stored convention has a
 * citation that resolves to real code. These cases are the ways a model breaks
 * that promise — a file it never saw, a line number past the end, a quote that
 * matches nothing — plus the one it half-keeps, where the code is real and only
 * the line number is wrong.
 */

const FILE = [
  'import { z } from "zod";',
  '',
  'export const ListQuery = z.object({',
  '  status: z.enum(["open", "merged"]).optional(),',
  '});',
  '',
  'export async function list(id: string) {',
  '  const rows = await db.select().from(pulls);',
  '  return rows;',
  '}',
].join('\n');

const files = new Map([['src/routes.ts', FILE]]);

const candidate = (over: Partial<ProposedCandidate> = {}): ProposedCandidate => ({
  category: 'api',
  rule: 'Query parameters are declared with a Zod schema.',
  evidence: [
    { path: 'src/routes.ts', line_start: 3, line_end: 5, snippet: 'export const ListQuery = z.object({' },
  ],
  confidence: 0.9,
  ...over,
});

describe('conventions verifier — one citation', () => {
  it('accepts a quote that really sits in the claimed range', () => {
    const result = verifyEvidence(
      { path: 'src/routes.ts', line_start: 3, line_end: 5, snippet: 'status: z.enum' },
      files,
    );
    expect(result.ok).toBe(true);
  });

  it('reads the snippet back from the FILE, not from the answer', () => {
    const result = verifyEvidence(
      { path: 'src/routes.ts', line_start: 7, line_end: 7, snippet: 'export async function list' },
      files,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.evidenceSnippet).toBe('export async function list(id: string) {');
    }
  });

  it('refuses a file the model was never shown', () => {
    const result = verifyEvidence(
      { path: 'src/never-sampled.ts', line_start: 1, line_end: 2, snippet: 'anything' },
      files,
    );
    expect(result).toEqual({ ok: false, reason: 'missing_file' });
  });

  it('refuses an impossible or oversized range', () => {
    expect(
      verifyEvidence({ path: 'src/routes.ts', line_start: 0, line_end: 2, snippet: 'x' }, files),
    ).toEqual({ ok: false, reason: 'bad_lines' });
    expect(
      verifyEvidence({ path: 'src/routes.ts', line_start: 9, line_end: 4, snippet: 'x' }, files),
    ).toEqual({ ok: false, reason: 'bad_lines' });
    expect(
      verifyEvidence({ path: 'src/routes.ts', line_start: 1, line_end: 999, snippet: 'x' }, files),
    ).toEqual({ ok: false, reason: 'bad_lines' });
  });

  it('refuses a quote that is nowhere in the file', () => {
    const result = verifyEvidence(
      { path: 'src/routes.ts', line_start: 3, line_end: 4, snippet: 'app.use(cors())' },
      files,
    );
    expect(result).toEqual({ ok: false, reason: 'snippet_mismatch' });
  });

  it('repairs the line number when the quote is real but the address is wrong', () => {
    const result = verifyEvidence(
      { path: 'src/routes.ts', line_start: 1, line_end: 1, snippet: 'return rows;' },
      files,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.evidenceLineStart).toBe(9);
      expect(result.value.evidenceSnippet.trim()).toBe('return rows;');
    }
  });

  it('rebuilds an oversized range around a short quote that is really there', () => {
    // The first real scan lost 3 of 10 proposals this way: a whole function
    // cited around a two-line quote.
    const result = verifyEvidence(
      {
        path: 'src/routes.ts',
        line_start: 1,
        line_end: 120,
        snippet: 'export async function list(id: string) {\n  const rows = await db.select().from(pulls);',
      },
      files,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.evidenceLineStart).toBe(7);
      expect(result.value.evidenceLineEnd).toBe(8);
    }
  });

  it('matches a quote the model copied WITH the sample line numbers', () => {
    const result = verifyEvidence(
      {
        path: 'src/routes.ts',
        line_start: 7,
        line_end: 8,
        snippet: ' 7 | export async function list(id: string) {\n 8 |   const rows = await db.select().from(pulls);',
      },
      files,
    );
    expect(result.ok).toBe(true);
  });

  it('refuses a quote longer than a citation can be', () => {
    const long = Array.from({ length: 25 }, (_, i) => `line ${i}`).join('\n');
    expect(
      verifyEvidence({ path: 'src/routes.ts', line_start: 1, line_end: 3, snippet: long }, files),
    ).toEqual({ ok: false, reason: 'bad_lines' });
  });

  it('never relocates a quote short enough to match anywhere by accident', () => {
    // `});` is in the file, but it is in almost every file.
    expect(
      verifyEvidence({ path: 'src/routes.ts', line_start: 0, line_end: 0, snippet: '});' }, files),
    ).toEqual({ ok: false, reason: 'bad_lines' });
  });

  it('ignores indentation and trailing punctuation when matching', () => {
    const result = verifyEvidence(
      { path: 'src/routes.ts', line_start: 8, line_end: 8, snippet: 'const rows = await db.select().from(pulls)' },
      files,
    );
    expect(result.ok).toBe(true);
  });
});

describe('conventions verifier — a whole answer', () => {
  it('keeps a candidate whose first surviving citation wins', () => {
    const { kept, discarded } = verifyCandidates(
      [
        candidate({
          evidence: [
            { path: 'nope.ts', line_start: 1, line_end: 1, snippet: 'x' },
            { path: 'src/routes.ts', line_start: 7, line_end: 7, snippet: 'export async function list' },
          ],
        }),
      ],
      files,
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]!.evidencePath).toBe('src/routes.ts');
    expect(discarded.missing_file).toBe(0);
  });

  it('drops a candidate with no citation that survives, and says why', () => {
    const { kept, discarded } = verifyCandidates(
      [candidate({ evidence: [{ path: 'gone.ts', line_start: 1, line_end: 1, snippet: 'x' }] })],
      files,
    );
    expect(kept).toEqual([]);
    expect(discarded.missing_file).toBe(1);
  });

  it('drops a candidate with no citation at all', () => {
    const { kept, discarded } = verifyCandidates([candidate({ evidence: [] })], files);
    expect(kept).toEqual([]);
    expect(discarded.missing_file).toBe(1);
  });

  it('never resurrects a rejected rule, however it is spelled', () => {
    const { kept, discarded } = verifyCandidates([candidate()], files, {
      rejectedRules: ['query parameters are declared with a `Zod` schema'],
    });
    expect(kept).toEqual([]);
    expect(discarded.rejected_before).toBe(1);
  });

  it('does not propose a rule the user already accepted', () => {
    const { kept, discarded } = verifyCandidates([candidate()], files, {
      knownRules: ['Query parameters are declared with a Zod schema.'],
    });
    expect(kept).toEqual([]);
    expect(discarded.duplicate).toBe(1);
  });

  it('collapses duplicates inside one answer', () => {
    const { kept, discarded } = verifyCandidates([candidate(), candidate()], files);
    expect(kept).toHaveLength(1);
    expect(discarded.duplicate).toBe(1);
  });

  it('clamps a confidence the model pushed out of range', () => {
    const { kept } = verifyCandidates([candidate({ confidence: 1.7 })], files);
    expect(kept[0]!.confidence).toBe(1);
  });
});

describe('conventions verifier — rule comparison', () => {
  it('ignores case, punctuation and markdown when comparing rules', () => {
    expect(normalizeRule('Handlers **return** `Result<T>`.')).toBe(
      normalizeRule('handlers return result t'),
    );
  });
});

describe('conventions verifier — line-number gutters', () => {
  it('strips a gutter only when most lines carry one', () => {
    expect(stripLineNumbers(' 3 | const a = 1;\n 4 | const b = 2;')).toBe('const a = 1;\nconst b = 2;');
    // Real code that happens to contain `1 | 2` on one line of three stays as it is.
    const code = 'const mask = 1 | 2;\nconst other = 3;\nconst more = 4;';
    expect(stripLineNumbers(code)).toBe(code);
  });
});
