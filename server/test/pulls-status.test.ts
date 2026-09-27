/**
 * PR-list rollup helpers (`modules/pulls/status.ts`) — the pure derivation that
 * decides each PR's review STATUS and tallies its FINDINGS for the list. The DB
 * `status` column holds GitHub's merge state; the review status
 * (needs_review / reviewed / stale) is derived here from head vs lastReviewedSha
 * + age, so it gets unit coverage independent of the route's queries.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveReviewStatus,
  isPartialRun,
  rollupSeverities,
  runScore,
  previewDescription,
  toFindingPreviews,
  PR_FINDING_PREVIEW_LIMIT,
  PR_FINDING_DESCRIPTION_MAX,
  STALE_DAYS,
  type PreviewableFinding,
} from '../src/modules/pulls/status.js';

const DAY = 86_400_000;
const now = Date.UTC(2026, 5, 11);

describe('deriveReviewStatus', () => {
  it('needs_review when never reviewed, or when head moved since the last review', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: null, headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'old', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
  });

  it('reviewed when the current head was reviewed and the PR is recent', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now - DAY), now }),
    ).toBe('reviewed');
  });

  it('stale when the current head was reviewed but the PR is older than STALE_DAYS', () => {
    expect(
      deriveReviewStatus({
        ghStatus: 'open',
        lastReviewedSha: 'abc',
        headSha: 'abc',
        updatedAt: new Date(now - (STALE_DAYS + 1) * DAY),
        now,
      }),
    ).toBe('stale');
  });

  it('keeps merged/closed regardless of review state', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'merged', lastReviewedSha: null, headSha: 'abc', updatedAt: null, now }),
    ).toBe('merged');
    expect(
      deriveReviewStatus({ ghStatus: 'closed', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('closed');
  });
});

describe('rollupSeverities', () => {
  it('tallies findings into critical / warning / suggestion buckets (ignores unknown)', () => {
    expect(
      rollupSeverities([
        { severity: 'CRITICAL' },
        { severity: 'CRITICAL' },
        { severity: 'WARNING' },
        { severity: 'SUGGESTION' },
        { severity: 'WEIRD' },
      ]),
    ).toEqual({ critical: 2, warning: 1, suggestion: 1 });
  });

  it('is all-zero for no findings', () => {
    expect(rollupSeverities([])).toEqual({ critical: 0, warning: 0, suggestion: 0 });
  });
});

describe('previewDescription', () => {
  it('flattens markdown to one plain-text line', () => {
    expect(previewDescription('The `foo` loop\nruns **twice**.\n\n- once per user')).toBe(
      'The foo loop runs twice. once per user',
    );
  });

  it('keeps code punctuation intact — this is a code-review tool', () => {
    // Regression: a global /[`*_>#]/ strip turned `sk_live_` into "sklive".
    expect(previewDescription('Line 12 contains a literal `sk_live_` Stripe key.')).toBe(
      'Line 12 contains a literal sk_live_ Stripe key.',
    );
    expect(previewDescription('The `() => {}` in `user_id` handling, see #482.')).toBe(
      'The () => {} in user_id handling, see #482.',
    );
  });

  it('strips block markers only at the start of a line', () => {
    expect(previewDescription('# Heading\n> quoted\n- bullet')).toBe('Heading quoted bullet');
  });

  it('drops fenced code blocks, which carry no summary value', () => {
    expect(previewDescription('Use a set:\n```ts\nconst s = new Set()\n```\nIt is O(1).')).toBe(
      'Use a set: It is O(1).',
    );
  });

  it('leaves a short line untruncated — no gratuitous ellipsis', () => {
    const short = 'A secret is committed in plain text.';
    expect(previewDescription(short)).toBe(short);
    expect(previewDescription(short)).not.toContain('…');
  });

  it('truncates on a word boundary and marks it', () => {
    const long = `${'alpha bravo '.repeat(40)}omega`;
    const out = previewDescription(long);
    expect(out.length).toBeLessThanOrEqual(PR_FINDING_DESCRIPTION_MAX + 1); // + the ellipsis
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toContain('omega');
    // Word boundary: the text right before the ellipsis is a WHOLE word from
    // the repeating "alpha bravo " unit, not a partial cut like "alph…". A
    // `trimEnd()`-only check (dropping the lastSpace branch) would still pass
    // here since the cut never lands on a space — only the exact word test does.
    expect(out.slice(0, -1)).toMatch(/(?:alpha|bravo)$/);
  });
});

describe('toFindingPreviews', () => {
  const f = (o: Partial<PreviewableFinding> & { id: string }): PreviewableFinding => ({
    severity: 'WARNING',
    category: 'bug',
    title: `title ${o.id}`,
    file: 'src/a.ts',
    startLine: 1,
    endLine: 2,
    rationale: 'because',
    confidence: 0.5,
    ...o,
  });

  it('orders worst-first, then by confidence, then stably by id', () => {
    const out = toFindingPreviews([
      f({ id: 'b', severity: 'SUGGESTION' }),
      f({ id: 'c', severity: 'CRITICAL', confidence: 0.7 }),
      f({ id: 'a', severity: 'CRITICAL', confidence: 0.9 }),
      f({ id: 'd', severity: 'WARNING' }),
      f({ id: 'e', severity: 'CRITICAL', confidence: 0.7 }),
    ]);
    expect(out.map((p) => p.id)).toEqual(['a', 'c', 'e', 'd', 'b']);
  });

  it('caps the list — the count and the preview length are separate concerns', () => {
    const many = Array.from({ length: PR_FINDING_PREVIEW_LIMIT + 4 }, (_, i) =>
      f({ id: `f${i}` }),
    );
    expect(toFindingPreviews(many)).toHaveLength(PR_FINDING_PREVIEW_LIMIT);
  });

  it('drops off-enum severities the list cannot render', () => {
    const out = toFindingPreviews([f({ id: 'a', severity: 'WEIRD' }), f({ id: 'b' })]);
    expect(out.map((p) => p.id)).toEqual(['b']);
  });

  it('maps DB columns to the snake_case contract shape', () => {
    const [p] = toFindingPreviews([
      f({ id: 'a', startLine: 45, endLine: 52, rationale: 'The `loop` is **hot**.' }),
    ]);
    expect(p).toEqual({
      id: 'a',
      severity: 'WARNING',
      category: 'bug',
      title: 'title a',
      file: 'src/a.ts',
      start_line: 45,
      end_line: 52,
      confidence: 0.5,
      description: 'The loop is hot.',
    });
  });
});

describe('runScore', () => {
  const row = (severity: string, dismissedAt: Date | null = null) => ({ severity, dismissedAt });

  it('charges every finding, a duplicate flagged by two agents included', () => {
    // Engine penalties: CRITICAL 35, WARNING 12, SUGGESTION 3.
    expect(runScore([row('WARNING'), row('WARNING')])).toBe(76);
    expect(runScore([row('CRITICAL'), row('SUGGESTION')])).toBe(62);
  });

  it('skips dismissed findings', () => {
    expect(runScore([row('CRITICAL', new Date()), row('WARNING')])).toBe(88);
  });

  it('is 100 for no findings, clamps at 0, and ignores an unknown severity', () => {
    expect(runScore([])).toBe(100);
    expect(runScore([row('CRITICAL'), row('CRITICAL'), row('CRITICAL')])).toBe(0);
    expect(runScore([row('INFO')])).toBe(100);
  });
});

describe('isPartialRun', () => {
  it('is true when any agent of the run failed or was cancelled', () => {
    expect(isPartialRun(['done', 'failed'])).toBe(true);
    expect(isPartialRun(['cancelled'])).toBe(true);
  });

  it('is false for finished, still-running or unknown statuses, and for no runs', () => {
    expect(isPartialRun(['done', 'done'])).toBe(false);
    expect(isPartialRun(['done', 'running'])).toBe(false);
    expect(isPartialRun([null])).toBe(false);
    expect(isPartialRun([])).toBe(false);
  });
});
