import { describe, it, expect } from 'vitest';
import {
  parseRefs,
  deriveConfidence,
  fitToBudget,
  redactRef,
  outlineFromPatches,
  renderOutline,
  type BudgetSection,
  type OutlineFile,
} from '../src/modules/intent/helpers.js';
import { MIN_TRIMMED_SECTION_CHARS } from '../src/modules/intent/constants.js';

describe('parseRefs', () => {
  const repo = { owner: 'our', name: 'repo' };

  it('extracts closing-keyword issues (same-repo bare #N, owner/repo#N, and a GitHub issue URL), ignores a bare #N with no closing keyword, maps a same-repo blob link to a repo doc path, keeps a bare doc token, and dedupes a repeated reference', () => {
    const body = [
      'Fixes #12 in this repo.',
      'Also closes acme/api#7 in another repo.',
      'Resolved: https://github.com/acme/api/issues/9',
      'See #3 for background (not a closing reference).',
      'Docs: docs/plans/x.md',
      'Spec: https://github.com/our/repo/blob/main/docs/spec.md',
      'Fixes #12 again (duplicate).',
    ].join('\n');

    const result = parseRefs(body, repo);

    expect(result.issues).toEqual([
      { owner: 'our', name: 'repo', number: 12 },
      { owner: 'acme', name: 'api', number: 7 },
      { owner: 'acme', name: 'api', number: 9 },
    ]);
    expect(result.docs).toEqual(expect.arrayContaining(['docs/plans/x.md', 'docs/spec.md']));
    expect(result.docs).toHaveLength(2);
    // The same-repo issue and blob links are consumed as issues/docs, never as fetch URLs.
    expect(result.urls).toEqual([]);
  });

  it('rewrites another repo\'s blob URL to a raw.githubusercontent.com fetch URL', () => {
    const body = 'See https://github.com/other-org/other-repo/blob/main/README.md for prior art.';
    const result = parseRefs(body, repo);

    expect(result.urls).toEqual([
      'https://raw.githubusercontent.com/other-org/other-repo/main/README.md',
    ]);
    expect(result.docs).toEqual([]);
  });

  it('keeps the query string but drops the fragment on a plain https fetch URL', () => {
    const body = 'See https://example.com/page?x=1&y=2#section for details.';
    const result = parseRefs(body, repo);

    expect(result.urls).toEqual(['https://example.com/page?x=1&y=2']);
  });

  it('does not return a non-blob github.com URL (an issue or pull page) as a fetch URL', () => {
    const body =
      'See https://github.com/acme/api/issues/42 and https://github.com/acme/api/pull/7 for context.';
    const result = parseRefs(body, repo);

    expect(result.urls).toEqual([]);
    expect(result.docs).toEqual([]);
  });

  it('requires the closing keyword and the reference to be separated by spaces or tabs, not a newline', () => {
    const body = 'Closes\n#42';
    const result = parseRefs(body, repo);

    expect(result.issues).toEqual([]);
  });
});

describe('deriveConfidence', () => {
  it('gives high confidence when a linked issue, repo_doc or web source resolved (ok or truncated)', () => {
    expect(deriveConfidence([{ kind: 'issue', status: 'ok' }], '')).toBe('high');
    expect(deriveConfidence([{ kind: 'repo_doc', status: 'truncated' }], '')).toBe('high');
    expect(deriveConfidence([{ kind: 'web', status: 'ok' }], '')).toBe('high');
  });

  it('falls back to medium when no source resolved but the description is non-empty', () => {
    expect(deriveConfidence([], 'Some PR description')).toBe('medium');
    // A resolved diff_outline source never counts toward high.
    expect(deriveConfidence([{ kind: 'diff_outline', status: 'ok' }], 'desc')).toBe('medium');
  });

  it('falls back to low when nothing resolved and the description is blank; an unavailable issue does not raise it to high', () => {
    expect(deriveConfidence([], '')).toBe('low');
    expect(deriveConfidence([{ kind: 'issue', status: 'unavailable' }], '   ')).toBe('low');
  });
});

describe('fitToBudget', () => {
  const fileA: OutlineFile = {
    path: 'a.ts',
    hunkHeaders: ['@@ -1,5 +1,5 @@ ctx a1', '@@ -20,3 +20,3 @@ ctx a2'],
  };
  const fileB: OutlineFile = { path: 'b.ts', hunkHeaders: ['@@ -1,5 +1,5 @@ ctx b1'] };
  const outline: OutlineFile[] = [fileA, fileB];
  const count = (t: string): number => t.length;

  it('removes hunk headers before trimming a fetched doc section, dropping the last file\'s headers first', () => {
    const fullOutlineText = renderOutline(outline);
    const keepAOnlyText = renderOutline([fileA, { ...fileB, hunkHeaders: [] }]);
    const docText = 'D'.repeat(2000);
    // Exactly enough budget to keep file A's headers but not file B's.
    const budget = docText.length + keepAOnlyText.length;

    const sections: BudgetSection[] = [
      { label: 'file outline', kind: 'diff_outline', ref: '', text: fullOutlineText, status: 'ok', outline },
      { label: 'linked issue', kind: 'issue', ref: 'https://example.com/x', text: docText, status: 'ok' },
    ];

    const [outlineOut, docOut] = fitToBudget(sections, count, budget);

    expect(outlineOut!.outline).toEqual([fileA, { ...fileB, hunkHeaders: [] }]);
    expect(outlineOut!.status).toBe('truncated');
    // The doc section is untouched while headers alone can close the gap.
    expect(docOut!.text).toBe(docText);
    expect(docOut!.status).toBe('ok');
  });

  it('trims the fetched doc only once every hunk header is already gone, and never below MIN_TRIMMED_SECTION_CHARS', () => {
    const docText = 'D'.repeat(5000);
    const budget = MIN_TRIMMED_SECTION_CHARS + 5;

    const sections: BudgetSection[] = [
      { label: 'file outline', kind: 'diff_outline', ref: '', text: renderOutline(outline), status: 'ok', outline },
      { label: 'linked issue', kind: 'issue', ref: 'https://example.com/x', text: docText, status: 'ok' },
    ];

    const [outlineOut, docOut] = fitToBudget(sections, count, budget);

    expect(outlineOut!.outline!.every((f) => f.hunkHeaders.length === 0)).toBe(true);
    expect(docOut!.status).toBe('truncated');
    expect(docOut!.text.length).toBeLessThan(docText.length);
    expect(docOut!.text.length).toBeGreaterThanOrEqual(MIN_TRIMMED_SECTION_CHARS);
  });
});

describe('redactRef', () => {
  it('redacts a URL ref to origin + pathname, dropping the query string and fragment', () => {
    expect(redactRef('https://example.com/a/b?x=1&y=2#section')).toBe('https://example.com/a/b');
  });

  it('leaves a non-URL ref unchanged, including a trailing # or ? it may contain', () => {
    // No `https?://` scheme, so this must short-circuit before any URL parsing;
    // a ref containing '#' / '?' would otherwise reveal a wrong parse via the
    // same stripping logic used for real URLs.
    expect(redactRef('src/file.ts#L10')).toBe('src/file.ts#L10');
  });
});

describe('outlineFromPatches', () => {
  it('extracts only the @@ hunk header lines per file, in order', () => {
    const files = [
      {
        path: 'a.ts',
        patch:
          '@@ -1,3 +1,4 @@ export function f() {\n+  return 1;\n-  return 0;\n@@ -10,2 +11,2 @@ later\n context',
      },
      { path: 'b.ts', patch: null },
    ];

    const outline = outlineFromPatches(files);

    expect(outline).toEqual([
      {
        path: 'a.ts',
        hunkHeaders: ['@@ -1,3 +1,4 @@ export function f() {', '@@ -10,2 +11,2 @@ later'],
      },
      { path: 'b.ts', hunkHeaders: [] },
    ]);
  });

  it('never contains a + or - body line even when one sits right next to a hunk header', () => {
    const outline = outlineFromPatches([
      { path: 'a.ts', patch: '@@ -1,1 +1,1 @@ ctx\n+added line\n-removed line' },
    ]);

    const allHeaders = outline.flatMap((f) => f.hunkHeaders);
    expect(allHeaders).toEqual(['@@ -1,1 +1,1 @@ ctx']);
    for (const header of allHeaders) {
      expect(header.startsWith('+')).toBe(false);
      expect(header.startsWith('-')).toBe(false);
    }
  });
});
