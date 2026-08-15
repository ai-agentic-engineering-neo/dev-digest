import { describe, it, expect } from 'vitest';
import { groundBrief } from '../src/modules/brief/grounding.js';
import type { BriefFactSet } from '../src/modules/brief/facts.js';
import type { BriefGenerationOutput } from '../src/modules/brief/schemas.js';

/**
 * specs/11-why-risk-brief.md — grounding (AC-15..AC-22).
 */

function baseFacts(overrides: Partial<BriefFactSet> = {}): BriefFactSet {
  return {
    pr: { number: 1, title: 'PR', body: null, headSha: 'sha1', base: 'main', additions: 10, deletions: 2, filesCount: 1 },
    intent: { available: false, resolvedAt: null },
    issue: { available: false },
    spec: { available: false },
    files: [{ path: 'src/a.ts', additions: 5, deletions: 1, hunks: [{ start: 10, end: 15 }] }],
    blast: {
      changedSymbols: [{ file: 'src/a.ts', name: 'handler', kind: 'function' }],
      callers: [{ file: 'src/caller.ts', symbol: 'callerFn', viaSymbol: 'handler', line: 3, rank: 5 }],
      impactedEndpoints: ['GET /api/orders'],
      crons: ['nightly-sync'],
      degraded: false,
      indexStatus: 'full',
      indexSha: 'sha-idx',
      indexerVersion: 2,
    },
    changedFiles: new Set(['src/a.ts']),
    blastFiles: new Set(['src/caller.ts']),
    knownEndpoints: new Set(['GET /api/orders']),
    knownCrons: new Set(['nightly-sync']),
    knownSymbols: new Set(['handler', 'callerFn']),
    ...overrides,
  };
}

function rawOutput(overrides: Partial<BriefGenerationOutput> = {}): BriefGenerationOutput {
  return {
    what: 'This PR adds a handler.',
    why: 'It fixes a bug.',
    risk_level: 'medium',
    risks: [
      {
        kind: 'performance',
        title: 'Hot path change',
        explanation: 'Touches the handler function.',
        severity: 'medium',
        file_refs: [{ file: 'src/a.ts', line: 12 }],
      },
    ],
    review_focus: [{ file: 'src/a.ts', line: 12, reason: 'Core logic change.' }],
    ...overrides,
  };
}

describe('groundBrief', () => {
  it('a clean stubbed response survives fully grounded', () => {
    const { brief, dropped } = groundBrief(rawOutput(), baseFacts());
    expect(brief.risks).toHaveLength(1);
    expect(brief.risks[0]!.file_refs).toEqual(['src/a.ts:12']);
    expect(brief.review_focus).toEqual([{ file: 'src/a.ts', line: 12, reason: 'Core logic change.' }]);
    expect(dropped.paths).toEqual([]);
  });

  it('AC-16: a risk file_ref naming a path outside changed+blast files is dropped', () => {
    const raw = rawOutput({
      risks: [
        {
          kind: 'other',
          title: 'Ghost risk',
          explanation: 'x',
          severity: 'low',
          file_refs: [{ file: 'src/does-not-exist.ts', line: null }],
        },
      ],
    });
    const { brief, dropped } = groundBrief(raw, baseFacts());
    expect(brief.risks).toEqual([]); // AC-17: no surviving ref → risk dropped whole
    expect(dropped.paths).toEqual(['src/does-not-exist.ts']);
    expect(dropped.risks).toEqual(['Ghost risk']);
  });

  it('AC-16 edge case: a risk citing a blast-only CALLER file (not changed by this PR) survives', () => {
    const raw = rawOutput({
      risks: [
        {
          kind: 'api_contract',
          title: 'Downstream caller affected',
          explanation: 'x',
          severity: 'high',
          file_refs: [{ file: 'src/caller.ts', line: null }],
        },
      ],
    });
    const { brief } = groundBrief(raw, baseFacts());
    expect(brief.risks).toHaveLength(1);
    expect(brief.risks[0]!.file_refs).toEqual(['src/caller.ts']);
  });

  it('AC-19: a review-focus entry citing an unchanged file (even a blast-only one) is dropped', () => {
    const raw = rawOutput({ review_focus: [{ file: 'src/caller.ts', line: null, reason: 'x' }] });
    const { brief, dropped } = groundBrief(raw, baseFacts());
    expect(brief.review_focus).toEqual([]);
    expect(dropped.focus).toEqual(['src/caller.ts']);
  });

  it('AC-20: a line outside every hunk range survives as a file-only reference', () => {
    const raw = rawOutput({
      risks: [
        {
          kind: 'other',
          title: 'x',
          explanation: 'x',
          severity: 'low',
          file_refs: [{ file: 'src/a.ts', line: 999 }],
        },
      ],
      review_focus: [{ file: 'src/a.ts', line: 999, reason: 'x' }],
    });
    const { brief, dropped } = groundBrief(raw, baseFacts());
    expect(brief.risks[0]!.file_refs).toEqual(['src/a.ts']); // no ":999"
    expect(brief.review_focus[0]!.line).toBeNull();
    expect(dropped.lines).toEqual(expect.arrayContaining(['src/a.ts:999', 'src/a.ts:999']));
  });

  it('AC-15: an invented risk kind normalises to "other" and the risk is never dropped for it', () => {
    const raw = rawOutput({ risks: [{ ...rawOutput().risks[0]!, kind: 'made-up-kind' }] });
    const { brief } = groundBrief(raw, baseFacts());
    expect(brief.risks[0]!.kind).toBe('other');
  });

  it('AC-15: a documented kind survives verbatim (case/whitespace-normalised)', () => {
    const raw = rawOutput({ risks: [{ ...rawOutput().risks[0]!, kind: ' Auth-Surface ' }] });
    const { brief } = groundBrief(raw, baseFacts());
    expect(brief.risks[0]!.kind).toBe('auth_surface');
  });

  it('AC-21: an external link neutralises to visible text; a real repo-relative link survives', () => {
    const raw = rawOutput({
      why: 'See [the docs](https://evil.example/x) and [a.ts](src/a.ts) for detail.',
    });
    const { brief, dropped } = groundBrief(raw, baseFacts());
    expect(brief.why).not.toContain('https://evil.example');
    expect(brief.why).toContain('the docs');
    expect(brief.why).toContain('[a.ts](src/a.ts)');
    expect(dropped.links).toEqual(['https://evil.example/x']);
  });

  it('AC-21: a reference-style link definition to an untrusted target is dropped', () => {
    const raw = rawOutput({ why: 'Read [more][ref] about it.\n\n[ref]: https://evil.example/y' });
    const { brief, dropped } = groundBrief(raw, baseFacts());
    expect(brief.why).not.toContain('https://evil.example');
    expect(dropped.links).toContain('https://evil.example/y');
  });

  it('AC-18: a bare endpoint mention absent from the blast facts is dropped as a citation', () => {
    const raw = rawOutput({
      risks: [
        {
          kind: 'api_contract',
          title: 'x',
          explanation: 'Also touches GET /api/does-not-exist under load.',
          severity: 'low',
          file_refs: [{ file: 'src/a.ts', line: null }],
        },
      ],
    });
    const { brief, dropped } = groundBrief(raw, baseFacts());
    expect(brief.risks[0]!.explanation).not.toContain('/api/does-not-exist');
    expect(dropped.citations).toContain('GET /api/does-not-exist');
  });

  it('AC-18: a real endpoint mention survives untouched', () => {
    const raw = rawOutput({
      risks: [
        {
          kind: 'api_contract',
          title: 'x',
          explanation: 'Also touches GET /api/orders under load.',
          severity: 'low',
          file_refs: [{ file: 'src/a.ts', line: null }],
        },
      ],
    });
    const { brief } = groundBrief(raw, baseFacts());
    expect(brief.risks[0]!.explanation).toContain('GET /api/orders');
  });

  it('AC-18: a backtick-quoted symbol absent from the blast facts is dropped as a citation, visible word kept', () => {
    const raw = rawOutput({ why: 'This changes `notARealSymbol` directly.' });
    const { brief, dropped } = groundBrief(raw, baseFacts());
    expect(brief.why).toContain('notARealSymbol'); // visible word kept
    expect(brief.why).not.toContain('`notARealSymbol`'); // "verified symbol" framing (backticks) dropped
    expect(dropped.citations).toContain('notARealSymbol');
  });

  it('AC-18: a backtick-quoted symbol present in the known-symbols set survives untouched, backticks included', () => {
    const raw = rawOutput({ why: 'This changes `handler` directly.' });
    const { brief, dropped } = groundBrief(raw, baseFacts());
    expect(brief.why).toContain('`handler`');
    expect(dropped.citations).toEqual([]);
  });

  it('AC-18: a backtick-quoted 5-field cron shape absent from the known-crons set is dropped as a citation', () => {
    const raw = rawOutput({ why: 'Runs on schedule `0 3 * * *` after this change.' });
    const { brief, dropped } = groundBrief(raw, baseFacts());
    expect(brief.why).toContain('0 3 * * *'); // visible text kept
    expect(brief.why).not.toContain('`0 3 * * *`');
    expect(dropped.citations).toContain('0 3 * * *');
  });

  it('AC-18: a backtick-quoted cron shape present in the known-crons set survives untouched', () => {
    const raw = rawOutput({ why: 'Runs on schedule `nightly-sync` after this change.' });
    const { brief, dropped } = groundBrief(raw, baseFacts());
    expect(brief.why).toContain('`nightly-sync`');
    expect(dropped.citations).toEqual([]);
  });

  it('AC-18: a backtick-quoted token matching a known/blast file is left untouched — governed by file grounding, not the citation scanner', () => {
    const raw = rawOutput({ why: 'See `src/caller.ts` for the downstream caller.' });
    const { brief, dropped } = groundBrief(raw, baseFacts());
    expect(brief.why).toContain('`src/caller.ts`');
    expect(dropped.citations).toEqual([]);
  });

  it('Q6: risk_level passes through untouched, even when every risk is dropped', () => {
    const raw = rawOutput({
      risk_level: 'high',
      risks: [
        {
          kind: 'other',
          title: 'ghost',
          explanation: 'x',
          severity: 'low',
          file_refs: [{ file: 'src/does-not-exist.ts', line: null }],
        },
      ],
    });
    const { brief } = groundBrief(raw, baseFacts());
    expect(brief.risk_level).toBe('high');
    expect(brief.risks).toEqual([]);
  });

  it('AC-34: zero surviving risks is representable (empty array, not an error)', () => {
    const raw = rawOutput({ risks: [] });
    const { brief } = groundBrief(raw, baseFacts());
    expect(brief.risks).toEqual([]);
  });

  it('Q5/AC-14: risks/focus are clamped to 6/5 AFTER dropping — a dropped risk frees a slot', () => {
    const risks: BriefGenerationOutput['risks'] = [
      // One ghost risk (dropped) followed by 7 real ones — with slice-after-drop,
      // all 6 real slots are usable; without it, the ghost would occupy one.
      {
        kind: 'other',
        title: 'ghost',
        explanation: 'x',
        severity: 'low',
        file_refs: [{ file: 'src/does-not-exist.ts', line: null }],
      },
      ...Array.from({ length: 7 }, (_, i) => ({
        kind: 'other' as const,
        title: `risk-${i}`,
        explanation: 'x',
        severity: 'low' as const,
        file_refs: [{ file: 'src/a.ts', line: null }],
      })),
    ];
    const { brief } = groundBrief(rawOutput({ risks }), baseFacts());
    expect(brief.risks).toHaveLength(6);
    expect(brief.risks.map((r) => r.title)).not.toContain('ghost');
  });

  it('Q5: what/why are clamped to the first 2 sentences', () => {
    const raw = rawOutput({
      what: 'Sentence one. Sentence two. Sentence three that should not appear.',
      why: 'Reason one! Reason two? Reason three that should not appear.',
    });
    const { brief } = groundBrief(raw, baseFacts());
    expect(brief.what).not.toContain('Sentence three');
    expect(brief.why).not.toContain('Reason three');
  });

  it('AC-22: nothing ungrounded ever survives into the returned brief object', () => {
    const raw = rawOutput({
      risks: [
        {
          kind: 'other',
          title: 'x',
          explanation: 'x',
          severity: 'low',
          file_refs: [{ file: 'src/does-not-exist.ts', line: null }, { file: 'src/a.ts', line: null }],
        },
      ],
    });
    const { brief } = groundBrief(raw, baseFacts());
    expect(JSON.stringify(brief)).not.toContain('does-not-exist');
  });
});
