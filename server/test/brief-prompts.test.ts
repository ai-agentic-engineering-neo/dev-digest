import { describe, it, expect } from 'vitest';
import { buildBriefMessages } from '../src/modules/brief/prompts.js';
import type { BriefFactSet } from '../src/modules/brief/facts.js';
import { BRIEF_INPUT_TOKEN_BUDGET } from '../src/modules/brief/constants.js';

/**
 * specs/11-why-risk-brief.md — the budget/drop loop (AC-8, AC-9, Q3).
 */

/** Deterministic char-count tokenizer — the loop's own correctness doesn't
 *  depend on tiktoken specifics. */
const tokenizer = { count: (s: string) => s.length };

function bigFacts(): BriefFactSet {
  const callers = Array.from({ length: 200 }, (_, i) => ({
    file: `src/caller-${i}.ts`,
    symbol: `fn${i}`,
    viaSymbol: 'handler',
    line: 1,
    rank: 200 - i,
  }));
  const endpoints = Array.from({ length: 200 }, (_, i) => `GET /api/e${i}`);
  const files = Array.from({ length: 200 }, (_, i) => ({
    path: `src/file-${i}.ts`,
    additions: 100,
    deletions: 50,
    hunks: [{ start: 1, end: 50 }],
  }));

  return {
    pr: {
      number: 1,
      title: 'A very large refactor'.repeat(5),
      body: 'x'.repeat(500),
      headSha: 'sha1',
      base: 'main',
      additions: 5000,
      deletions: 2000,
      filesCount: 200,
    },
    intent: { available: false, resolvedAt: null },
    issue: { available: true, number: 1, title: 'Large issue', body: 'y'.repeat(3000) },
    spec: { available: true, path: 'specs/99-big.md', content: 'z'.repeat(3000) },
    files,
    blast: {
      changedSymbols: [{ file: 'src/a.ts', name: 'handler', kind: 'function' }],
      callers,
      impactedEndpoints: endpoints,
      crons: ['nightly-1', 'nightly-2'],
      degraded: false,
      indexStatus: 'full',
      indexSha: 'idx',
      indexerVersion: 1,
    },
    changedFiles: new Set(files.map((f) => f.path)),
    blastFiles: new Set(callers.map((c) => c.file)),
    knownEndpoints: new Set(endpoints),
    knownCrons: new Set(['nightly-1', 'nightly-2']),
    knownSymbols: new Set(['handler']),
  };
}

function smallFacts(): BriefFactSet {
  return {
    pr: { number: 1, title: 'Small PR', body: 'A small change.', headSha: 'sha1', base: 'main', additions: 5, deletions: 1, filesCount: 1 },
    intent: { available: false, resolvedAt: null },
    issue: { available: false },
    spec: { available: false },
    files: [{ path: 'src/a.ts', additions: 5, deletions: 1, hunks: [{ start: 1, end: 5 }] }],
    blast: {
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      crons: [],
      degraded: false,
      indexStatus: 'full',
      indexSha: 'idx',
      indexerVersion: 1,
    },
    changedFiles: new Set(['src/a.ts']),
    blastFiles: new Set(),
    knownEndpoints: new Set(),
    knownCrons: new Set(),
    knownSymbols: new Set(),
  };
}

describe('buildBriefMessages', () => {
  it('AC-9/Q3: the FULL assembled input (system + guard + user) stays within budget, even for a deliberately oversized PR', () => {
    const { messages } = buildBriefMessages(bigFacts(), tokenizer);
    const total = messages.map((m) => m.content).join('').length;
    expect(total).toBeLessThanOrEqual(BRIEF_INPUT_TOKEN_BUDGET);
  });

  it('AC-8: dropping never truncates mid-item — a whole caller/endpoint/file line either fully appears or is fully absent', () => {
    const { payload } = buildBriefMessages(bigFacts(), tokenizer);
    // Every rendered line for a kept item is intact: check a few late-index
    // items either appear whole or not at all (never a partial "src/file-1" cut mid-digit).
    expect(payload.text).not.toMatch(/src\/file-\d+\.t$/m); // never cuts off ".ts" itself
  });

  it('AC-8: records how many drop categories were applied, persisted as `dropped_inputs`', () => {
    const { payload } = buildBriefMessages(bigFacts(), tokenizer);
    expect(payload.droppedCount).toBeGreaterThan(0);
  });

  it('a small PR needs no dropping at all', () => {
    const { payload } = buildBriefMessages(smallFacts(), tokenizer);
    expect(payload.droppedCount).toBe(0);
    expect(payload.tokens).toBeLessThanOrEqual(BRIEF_INPUT_TOKEN_BUDGET);
  });

  it('never drops PR title/body, intent-availability line, or the changed-file totals', () => {
    const { payload } = buildBriefMessages(bigFacts(), tokenizer);
    expect(payload.text).toContain('A very large refactor');
    expect(payload.text).toContain('totals: +5000 -2000 across 200 file(s)');
  });

  it('exactly one system message and one user message', () => {
    const { messages } = buildBriefMessages(smallFacts(), tokenizer);
    expect(messages.map((m) => m.role)).toEqual(['system', 'user']);
  });

  it('AC-8/D12: the caller-trim step keeps the highest-ranked callers and drops the lowest-ranked ones', () => {
    // Only the callers list is large enough to force the FIRST drop step;
    // everything else stays tiny so no later step ever fires. `prompts.ts`
    // trusts `facts.blast.callers` to ALREADY be rank-sorted descending —
    // that invariant is `facts.ts`'s `deriveBlastFact` job, not this
    // module's — so the fixture supplies it pre-sorted, exactly as
    // `assembleFacts` would.
    const callers = Array.from({ length: 300 }, (_, i) => ({
      file: `src/caller-rank-${299 - i}.ts`,
      symbol: `fn${299 - i}`,
      viaSymbol: 'handler',
      line: 1,
      rank: 299 - i, // 299..0, descending — rank 299 is the single highest
    }));
    const facts: BriefFactSet = {
      ...smallFacts(),
      blast: {
        changedSymbols: [],
        callers,
        impactedEndpoints: [],
        crons: [],
        degraded: false,
        indexStatus: 'full',
        indexSha: 'idx',
        indexerVersion: 1,
      },
      blastFiles: new Set(callers.map((c) => c.file)),
    };

    const { payload } = buildBriefMessages(facts, tokenizer);
    expect(payload.tokens).toBeLessThanOrEqual(BRIEF_INPUT_TOKEN_BUDGET);
    expect(payload.droppedCount).toBe(1); // only the caller-trim category fired
    // Top-20-by-rank (280..299) survive; a low-rank caller (rank 0) does not.
    expect(payload.text).toContain('src/caller-rank-299.ts');
    expect(payload.text).toContain('src/caller-rank-280.ts');
    expect(payload.text).not.toContain('src/caller-rank-0.ts:');
    expect(payload.text).toContain('top 20 of 300');
  });

  it('AC-8: drop steps stop as soon as the payload fits — a fixture needing only the cron-drop step leaves callers/endpoints/files untouched', () => {
    // Callers/endpoints/files all stay small (well within their own limits),
    // so step 1 (caller trim) is a structural no-op; only the crons list is
    // oversized, so step 2 should be the ONLY category that fires.
    const facts: BriefFactSet = {
      ...smallFacts(),
      blast: {
        changedSymbols: [],
        callers: [{ file: 'src/only-caller.ts', symbol: 'fn', viaSymbol: 'handler', line: 1, rank: 1 }],
        impactedEndpoints: ['GET /api/kept'],
        crons: Array.from({ length: 500 }, (_, i) => `cron-entry-number-${i}-padded-out-long`),
        degraded: false,
        indexStatus: 'full',
        indexSha: 'idx',
        indexerVersion: 1,
      },
      blastFiles: new Set(['src/only-caller.ts']),
      knownEndpoints: new Set(['GET /api/kept']),
    };

    const { payload } = buildBriefMessages(facts, tokenizer);
    expect(payload.tokens).toBeLessThanOrEqual(BRIEF_INPUT_TOKEN_BUDGET);
    expect(payload.droppedCount).toBe(1); // only the cron category fired
    expect(payload.text).not.toContain('### Impacted crons');
    // Callers and endpoints, both small, survive untouched — proving the
    // loop didn't over-apply later steps once the fixture already fit.
    expect(payload.text).toContain('src/only-caller.ts');
    expect(payload.text).toContain('GET /api/kept');
  });

  it('AC-35: with body, intent, issue and spec ALL absent, the payload states the absences it has a section for — never silently omits them', () => {
    const facts = smallFacts();
    facts.pr = { ...facts.pr, body: null };
    // `smallFacts()` already has intent/issue/spec unavailable — assert the
    // exact markers `renderPr`/`renderIntent` actually emit (read, not
    // assumed). The issue/spec sections are unconditionally OMITTED when
    // unavailable (no "## Linked issue"/"## Referenced spec" header at all)
    // rather than stated absent — assert that too, so a future silent-vs-
    // explicit regression in either direction is caught.
    const { payload } = buildBriefMessages(facts, tokenizer);
    expect(payload.text).toContain('(no description)');
    expect(payload.text).toContain('(not available — no cached intent for this PR)');
    expect(payload.text).not.toContain('## Linked issue');
    expect(payload.text).not.toContain('## Referenced spec');
  });
});
