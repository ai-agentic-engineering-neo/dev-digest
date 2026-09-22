import { describe, it, expect } from 'vitest';
import type { UnifiedDiff } from '@devdigest/shared';
import { reviewPullRequest, DEFAULT_MAP_CONCURRENCY, splitOversizeDiff } from '../src/index.js';
import { StubLLM } from './fixtures/llm.js';
import { configDiff } from './fixtures/diff.js';

/** N-file diff; each file adds line 11 (so a finding per file can be grounded). */
function nFileDiff(n: number): UnifiedDiff {
  const base = configDiff();
  const f0 = base.files[0]!;
  const paths = Array.from({ length: n }, (_, i) => `src/f${i}.ts`);
  return {
    raw: paths.map((p) => base.raw.replaceAll(f0.path, p)).join('\n'),
    files: paths.map((p) => ({ ...f0, path: p, hunks: f0.hunks.map((h) => ({ ...h, file: p })) })),
  };
}

const findingFor = (file: string) => ({
  id: file,
  severity: 'WARNING',
  category: 'bug',
  title: `issue in ${file}`,
  file,
  start_line: 11,
  end_line: 11,
  rationale: 'r',
  confidence: 0.9,
  kind: 'finding',
});

/** Which file a map chunk is about (the prompt carries its diff). */
const fileOf = (req: { messages: { content: string }[] }) =>
  /diff --git a\/(\S+)/.exec(req.messages.map((m) => m.content).join('\n'))![1]!;

describe('map-reduce concurrency', () => {
  it('runs at most `concurrency` chunks at once and keeps file order in the result', async () => {
    let inflight = 0;
    let peak = 0;
    const llm = new StubLLM({
      respond: async (req, i) => {
        inflight++;
        peak = Math.max(peak, inflight);
        // later chunks finish FIRST — order must still follow the diff
        await new Promise((r) => setTimeout(r, (6 - i) * 5));
        inflight--;
        const file = fileOf(req);
        return { verdict: 'comment', summary: file, score: 80, findings: [findingFor(file)] };
      },
    });
    const out = await reviewPullRequest({
      systemPrompt: 's',
      model: 'm',
      diff: nFileDiff(6),
      llm,
      strategy: 'map-reduce',
      concurrency: 2,
    });
    expect(peak).toBe(2);
    expect(out.review.findings.map((f) => f.file)).toEqual(
      Array.from({ length: 6 }, (_, i) => `src/f${i}.ts`),
    );
    expect(out.chunks.map((c) => c.label)).toEqual(Array.from({ length: 6 }, (_, i) => `src/f${i}.ts`));
  });

  it('defaults to 3 parallel chunks', async () => {
    let inflight = 0;
    let peak = 0;
    const llm = new StubLLM({
      respond: async () => {
        inflight++;
        peak = Math.max(peak, inflight);
        await new Promise((r) => setTimeout(r, 5));
        inflight--;
        return { verdict: 'approve', summary: '', score: 100, findings: [] };
      },
    });
    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff: nFileDiff(7), llm, strategy: 'map-reduce' });
    expect(DEFAULT_MAP_CONCURRENCY).toBe(3);
    expect(peak).toBe(3);
  });

  it('checkCancelled runs before every chunk; a cancel stops launching new chunks', async () => {
    let checks = 0;
    const llm = new StubLLM({ data: { verdict: 'approve', summary: '', score: 100, findings: [] } });
    await expect(
      reviewPullRequest({
        systemPrompt: 's',
        model: 'm',
        diff: nFileDiff(6),
        llm,
        strategy: 'map-reduce',
        concurrency: 1,
        checkCancelled: () => {
          if (++checks === 3) throw new Error('cancelled');
        },
      }),
    ).rejects.toThrow('cancelled');
    expect(llm.calls).toHaveLength(2);
  });
});

describe('max diff chars guard', () => {
  /** One file, many hunks: each hunk adds one line (new lines 1, 11, 21, …). */
  function bigOneFileDiff(hunks: number, bodyChars = 200): UnifiedDiff {
    const head = 'diff --git a/src/big.ts b/src/big.ts\n--- a/src/big.ts\n+++ b/src/big.ts';
    const body: string[] = [];
    const parsed = [];
    for (let i = 0; i < hunks; i++) {
      const start = i * 10 + 1;
      body.push(`@@ -${start},1 +${start},2 @@\n ctx\n+${'x'.repeat(bodyChars)}`);
      parsed.push({ file: 'src/big.ts', oldStart: start, oldLines: 1, newStart: start, newLines: 2, newLineNumbers: [start, start + 1] });
    }
    return {
      raw: [head, ...body].join('\n'),
      files: [{ path: 'src/big.ts', additions: hunks, deletions: 0, hunks: parsed }],
    };
  }

  it('splits an oversize single file by hunks (never cutting a hunk) and warns', async () => {
    const diff = bigOneFileDiff(10);
    const llm = new StubLLM({ data: { verdict: 'approve', summary: '', score: 100, findings: [] } });
    const events: string[] = [];
    const out = await reviewPullRequest({
      systemPrompt: 's',
      model: 'm',
      diff,
      llm,
      maxDiffChars: 800,
      onEvent: (e) => events.push(e.msg),
    });
    expect(llm.calls.length).toBeGreaterThan(1);
    expect(out.mode).toBe('map-reduce');
    expect(out.chunks[0]!.label).toMatch(/\(part 1\/\d+\)$/);
    // every hunk header reaches exactly one call, each with the file header
    const prompts = llm.calls.map((c) => c.messages.map((m) => m.content).join('\n'));
    for (let i = 0; i < 10; i++) {
      expect(prompts.filter((p) => p.includes(`@@ -${i * 10 + 1},1 +${i * 10 + 1},2 @@`))).toHaveLength(1);
    }
    expect(prompts.every((p) => p.includes('+++ b/src/big.ts'))).toBe(true);
    expect(events.some((m) => /exceeds maxDiffChars/.test(m))).toBe(true);
  });

  it('a single hunk larger than the cap is truncated with an explicit note', () => {
    const diff = bigOneFileDiff(1, 5_000);
    const r = splitOversizeDiff(diff.raw, 1_000);
    expect(r.truncated).toBe(true);
    expect(r.parts).toHaveLength(1);
    expect(r.parts[0]!.length).toBeLessThanOrEqual(1_000);
    expect(r.parts[0]).toContain('[diff truncated by reviewer-core');
  });

  it('a diff within the cap is untouched', () => {
    const raw = configDiff().raw;
    expect(splitOversizeDiff(raw, 10_000)).toEqual({ parts: [raw], truncated: false });
  });

  it('truncation surfaces as a warning event in the review', async () => {
    const llm = new StubLLM({ data: { verdict: 'approve', summary: '', score: 100, findings: [] } });
    const events: string[] = [];
    await reviewPullRequest({
      systemPrompt: 's',
      model: 'm',
      diff: bigOneFileDiff(1, 5_000),
      llm,
      maxDiffChars: 1_000,
      onEvent: (e) => events.push(e.msg),
    });
    expect(events.some((m) => /truncated/.test(m))).toBe(true);
  });
});

describe('temperature passthrough', () => {
  const data = { verdict: 'approve', summary: '', score: 100, findings: [] };
  it('defaults to 0 (deterministic reviews)', async () => {
    const llm = new StubLLM({ data });
    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff: configDiff(), llm });
    expect(llm.calls[0]!.temperature).toBe(0);
  });
  it('forwards an explicit value; null omits it (provider default)', async () => {
    const a = new StubLLM({ data });
    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff: configDiff(), llm: a, temperature: 0.3 });
    expect(a.calls[0]!.temperature).toBe(0.3);
    const b = new StubLLM({ data });
    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff: configDiff(), llm: b, temperature: null });
    expect(b.calls[0]).not.toHaveProperty('temperature');
  });
});
