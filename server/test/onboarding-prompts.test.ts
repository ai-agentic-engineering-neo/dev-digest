import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildOnboardingMessages, renderFactsPayload } from '../src/modules/onboarding/prompts.js';
import { assembleFacts, type FactSet } from '../src/modules/onboarding/facts.js';
import type { RepoIntelIndexState, RepoIntelPort, RepoIntelWeightedFile } from '../src/modules/onboarding/ports.js';
import { ONBOARDING_FACTS_TOKEN_BUDGET } from '../src/modules/onboarding/constants.js';

/**
 * specs/10-onboarding-generator.md — AC-5 (facts-only payload, no raw source
 * file contents) and D12/Q1 (drop-don't-truncate rule and the "never
 * dropped" list).
 */

const tokenizer = { count: (s: string) => Math.ceil(s.length / 4) };

class FakeRepoIntel implements RepoIntelPort {
  constructor(
    private state: RepoIntelIndexState,
    private weighted: RepoIntelWeightedFile[],
    private chains: string[][] = [],
  ) {}
  async getIndexState(): Promise<RepoIntelIndexState> {
    return this.state;
  }
  async getWeightedRankedFiles(_repoId: string, n: number): Promise<RepoIntelWeightedFile[]> {
    return this.weighted.slice(0, n);
  }
  async getCriticalPaths(): Promise<string[][]> {
    return this.chains;
  }
  async getFileFacts(): Promise<Array<{ file: string; endpoints: string[]; crons: string[] }>> {
    return [];
  }
}

const STATE: RepoIntelIndexState = {
  status: 'full',
  lastIndexedSha: 'sha-abc',
  indexerVersion: 2,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  filesIndexed: 50,
  filesSkipped: 0,
  hotnessPrs: 3,
  hotnessWindowDays: 180,
};

let clonePath: string | undefined;
afterEach(async () => {
  if (clonePath) await rm(clonePath, { recursive: true, force: true });
  clonePath = undefined;
});
async function withClone(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'onboarding-prompts-'));
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content);
  }
  clonePath = dir;
  return dir;
}

describe('buildOnboardingMessages — AC-5 (facts-only, no raw source contents)', () => {
  it('a sentinel string inside a fixture source file never reaches the assembled request', async () => {
    const dir = await withClone({
      'package.json': JSON.stringify({ scripts: { dev: 'next dev' } }),
      // This file is NOT part of the indexed set the fake repoIntel returns —
      // and even if it were, onboarding never reads source file BODIES at
      // all (only manifests, for stack/setup detection).
      'src/a.ts': 'export const SENTINEL_TOKEN_9f3a = "do-not-leak-me";',
    });
    const weighted = [{ path: 'src/a.ts', pagerank: 1, hotness: 0, weighted: 1, percentile: 90 }];
    const repoIntel = new FakeRepoIntel(STATE, weighted, []);
    const facts = await assembleFacts({ repoId: 'repo-1', clonePath: dir, repoIntel });

    const { messages } = buildOnboardingMessages(facts, tokenizer);
    const fullText = messages.map((m) => m.content).join('\n');

    expect(fullText).not.toContain('SENTINEL_TOKEN_9f3a');
    expect(fullText).not.toContain('do-not-leak-me');
    // The path itself IS a legitimate fact (AC-3) — only the file's raw
    // CONTENT is excluded.
    expect(fullText).toContain('src/a.ts');
  });

  it('includes the injection guard on the system message', async () => {
    const dir = await withClone({ 'package.json': '{}' });
    const repoIntel = new FakeRepoIntel(STATE, [], []);
    const facts = await assembleFacts({ repoId: 'repo-1', clonePath: dir, repoIntel });
    const { messages } = buildOnboardingMessages(facts, tokenizer);
    const system = messages.find((m) => m.role === 'system')!;
    expect(system.content).toContain('SECURITY — read carefully');
  });
});

describe('renderFactsPayload — D12/Q1 drop-don\'t-truncate rule', () => {
  const FILLER = 'x'.repeat(150);

  function bigFacts(): FactSet {
    const rankedFiles = Array.from({ length: 40 }, (_, i) => ({
      path: `src/mod-${i}/${FILLER}-${i}.ts`,
      pagerank: 1 - i / 1000,
      hotness: 0.5,
      weighted: 1 - i / 1000,
    }));
    const directory = Array.from({ length: 40 }, (_, i) => `src/mod-${i}/${FILLER}`);
    const routes = Array.from({ length: 40 }, (_, i) => ({
      file: `src/routes-${i}.ts`,
      endpoints: [`GET /api/${FILLER}-${i}`],
      crons: [`*/5 * * * * ${FILLER}-${i}`],
    }));
    const setupCandidates = Array.from({ length: 15 }, (_, i) => ({
      command: `run-${i}-${FILLER}`,
      kind: 'script' as const,
      evidenceFile: 'package.json',
    }));
    const readingPath = rankedFiles.slice(0, 10).map((r) => ({ path: r.path, weighted: r.weighted }));
    const criticalPaths = Array.from({ length: 10 }, (_, i) => ({
      root: rankedFiles[i]!.path,
      chain: [rankedFiles[i]!.path, rankedFiles[i + 1]!.path],
    }));
    return {
      stack: { frameworks: [] },
      setupCandidates,
      directory,
      rankedFiles,
      routes,
      readingPath,
      criticalPaths,
      coverage: {
        filesIndexed: 5000,
        filesExcluded: 100,
        indexStatus: 'full',
        indexSha: 'sha-big',
        indexerVersion: 2,
        prsWeighted: 40,
        hotnessWindowDays: 180,
      },
      allIndexedPaths: new Set(rankedFiles.map((r) => r.path)),
    };
  }

  it('drops whole entries, in the documented fixed order (crons → routes → directory>20 → rankedFiles>20 → scripts>10)', () => {
    const facts = bigFacts();
    const untrimmed = facts.rankedFiles.length + facts.directory.length + facts.routes.length + facts.setupCandidates.length;
    expect(untrimmed).toBeGreaterThan(0);

    const payload = renderFactsPayload(facts, tokenizer);

    // Something had to be dropped — the fixture is deliberately oversized.
    expect(payload.dropped.crons || payload.dropped.routes).toBe(true);

    // Ordering invariant: a LATER tier is never dropped without every
    // EARLIER tier also being dropped (whole-tier, fixed order — never
    // skipped ahead).
    if (payload.dropped.routes) expect(payload.dropped.crons).toBe(true);
    if (payload.dropped.directoryBeyond20) expect(payload.dropped.routes).toBe(true);
    if (payload.dropped.rankedFilesBeyond20) expect(payload.dropped.directoryBeyond20).toBe(true);
    if (payload.dropped.scriptsBeyond10) expect(payload.dropped.rankedFilesBeyond20).toBe(true);
  });

  it('drops crons (then routes) before ever touching directory/rankedFiles/scripts, which stay within their caps by construction', () => {
    const facts = bigFacts();
    // At-the-cap, not beyond it — structurally GUARANTEES (independent of
    // token math) that `directoryBeyond20`/`rankedFilesBeyond20`/
    // `scriptsBeyond10` can never fire, since `flags.limit < facts.length`
    // can never be true once `facts.length` already equals the cap.
    facts.directory = facts.directory.slice(0, 20);
    facts.rankedFiles = facts.rankedFiles.slice(0, 20);
    facts.setupCandidates = facts.setupCandidates.slice(0, 10);
    facts.readingPath = facts.rankedFiles.slice(0, 10).map((r) => ({ path: r.path, weighted: r.weighted }));
    facts.criticalPaths = facts.criticalPaths.slice(0, 10);
    // routes/crons deliberately left at full oversized bulk (40 entries,
    // both endpoints AND crons) — the only thing this fixture is over
    // budget on.

    const payload = renderFactsPayload(facts, tokenizer);

    expect(payload.dropped.directoryBeyond20).toBe(false);
    expect(payload.dropped.rankedFilesBeyond20).toBe(false);
    expect(payload.dropped.scriptsBeyond10).toBe(false);
    // Fixed order: routes is never dropped while crons survives — crons is
    // always tried FIRST.
    expect(payload.dropped.crons).toBe(true);
    if (payload.dropped.routes) {
      // Routes only fires AFTER crons, and even then the payload still fits
      // once both are gone (nothing beyond routes was ever needed).
      expect(payload.tokens).toBeLessThanOrEqual(ONBOARDING_FACTS_TOKEN_BUDGET);
    }
  });

  it('never drops coverage, stack, the ≤10 reading-path entries, the ≤10 critical-path chains, or the first 10 setup candidates — even under maximum pressure', () => {
    const facts = bigFacts();
    const payload = renderFactsPayload(facts, tokenizer);

    // Coverage facts (AC-18) — always present.
    expect(payload.text).toContain('files indexed: 5000');
    expect(payload.text).toContain('sha-big');

    // Every one of the ≤10 reading-path entries survives.
    for (const entry of facts.readingPath) {
      expect(payload.text).toContain(entry.path);
    }

    // Every one of the ≤10 critical-path chain roots survives.
    for (const chain of facts.criticalPaths) {
      expect(payload.text).toContain(chain.root);
    }

    // The first 10 setup candidates survive, verbatim, even though the
    // fixture supplies 15 (script-beyond-10 dropping only trims the TAIL).
    for (const candidate of facts.setupCandidates.slice(0, 10)) {
      expect(payload.text).toContain(candidate.command);
    }
  });

  it('drops whole entries, never truncates mid-entry: a surviving directory entry appears intact', () => {
    const facts = bigFacts();
    const payload = renderFactsPayload(facts, tokenizer);
    // The first directory entry is always inside the protected first-20
    // slice even after the directory>20 tier fires.
    expect(payload.text).toContain(facts.directory[0]!);
  });

  it('respects the token budget once it fits, and stops dropping once it does', () => {
    const facts = bigFacts();
    // Shrink to something that should fit well within budget without any
    // drops at all.
    facts.directory = facts.directory.slice(0, 2);
    facts.rankedFiles = facts.rankedFiles.slice(0, 2);
    facts.routes = [];
    facts.setupCandidates = facts.setupCandidates.slice(0, 2);
    facts.readingPath = facts.rankedFiles.map((r) => ({ path: r.path, weighted: r.weighted }));
    facts.criticalPaths = [];

    const payload = renderFactsPayload(facts, tokenizer);
    expect(payload.tokens).toBeLessThanOrEqual(ONBOARDING_FACTS_TOKEN_BUDGET);
    expect(payload.dropped).toEqual({
      crons: false,
      routes: false,
      directoryBeyond20: false,
      rankedFilesBeyond20: false,
      scriptsBeyond10: false,
    });
  });
});
