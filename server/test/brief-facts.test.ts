import { describe, it, expect } from 'vitest';
import { assembleFacts } from '../src/modules/brief/facts.js';
import type { RepoIntelBlastResult, RepoIntelIndexState, RepoIntelPort } from '../src/modules/brief/ports.js';
import type { BriefPrFileRow, BriefPullRow, BriefRepoRow } from '../src/modules/brief/repository.js';

/**
 * specs/11-why-risk-brief.md — fact assembly (AC-1..AC-9). Zero LLM calls by
 * construction (nothing in `facts.ts` touches an `LlmResolver`).
 */

const PULL: BriefPullRow = {
  id: 'pr-1',
  repoId: 'repo-1',
  number: 42,
  title: 'Fix rate limiting',
  body: 'Closes #7. See specs/07-blast-radius.md for background.',
  headSha: 'sha-head',
  base: 'main',
  additions: 20,
  deletions: 5,
  filesCount: 1,
  intentSummary: null,
  intentInScope: null,
  intentOutOfScope: null,
  intentContextGaps: null,
  intentSignals: null,
  intentResolvedAt: null,
};

const REPO: BriefRepoRow = { id: 'repo-1', owner: 'acme', name: 'demo', fullName: 'acme/demo', clonePath: '/tmp/clone' };

const SENTINEL = 'SENTINEL_PATCH_BODY_TEXT_998877';
const FILES: BriefPrFileRow[] = [
  { path: 'src/a.ts', additions: 10, deletions: 2, patch: `@@ -1,2 +1,2 @@\n-old\n+${SENTINEL}` },
];

function repoIntel(overrides: Partial<RepoIntelBlastResult> = {}, state: Partial<RepoIntelIndexState> = {}): RepoIntelPort {
  const blast: RepoIntelBlastResult = {
    changedSymbols: [{ file: 'src/a.ts', name: 'handler', kind: 'function' }],
    callers: [],
    // The 2-hop-only impact D15/Q1 is about: an endpoint reachable ONLY via
    // the reverse-import walk, which `BlastResult.impactedEndpoints` already
    // carries as a flat union (server/LEARNINGS.md:273-292).
    impactedEndpoints: ['GET /api/two-hop-only'],
    factsByFile: { 'src/reverse-caller.ts': { endpoints: ['GET /api/two-hop-only'], crons: ['nightly'] } },
    degraded: false,
    ...overrides,
  };
  const indexState: RepoIntelIndexState = {
    status: 'full',
    lastIndexedSha: 'idx-sha',
    indexerVersion: 3,
    updatedAt: new Date('2026-01-01'),
    ...state,
  };
  return {
    getBlastRadius: async () => blast,
    getIndexState: async () => indexState,
  };
}

function githubResolved(issue: { number: number; title: string; body?: string | null } | null) {
  return async () => ({
    getIssue: async () => {
      if (!issue) throw new Error('not found');
      return issue;
    },
  }) as never;
}

describe('assembleFacts', () => {
  it('AC-1: makes zero calls to anything LLM-shaped (structural — no LlmResolver in the input at all)', async () => {
    // No `LlmResolver` field exists on `AssembleFactsInput` — this is
    // enforced by the type signature, not just runtime behavior.
    const facts = await assembleFacts({
      pull: PULL,
      repo: REPO,
      files: FILES,
      repoIntel: repoIntel(),
      github: githubResolved(null),
      readSpec: async () => null,
    });
    expect(facts.pr.number).toBe(42);
  });

  it('AC-2/N2: the patch body text never reaches the fact set — only paths, counts and hunk ranges', async () => {
    const facts = await assembleFacts({
      pull: PULL,
      repo: REPO,
      files: FILES,
      repoIntel: repoIntel(),
      github: githubResolved(null),
      readSpec: async () => null,
    });
    expect(JSON.stringify(facts)).not.toContain(SENTINEL);
    expect(facts.files[0]!.hunks).toEqual([{ start: 1, end: 2 }]);
  });

  it('AC-3: intent is read from the cached pull columns only — never resolved/mutated here', async () => {
    const pullWithIntent: BriefPullRow = {
      ...PULL,
      intentSummary: 'Adds rate limiting',
      intentInScope: ['src/a.ts'],
      intentResolvedAt: new Date('2026-01-01'),
    };
    const facts = await assembleFacts({
      pull: pullWithIntent,
      repo: REPO,
      files: FILES,
      repoIntel: repoIntel(),
      github: githubResolved(null),
      readSpec: async () => null,
    });
    expect(facts.intent).toEqual({
      available: true,
      summary: 'Adds rate limiting',
      inScope: ['src/a.ts'],
      resolvedAt: pullWithIntent.intentResolvedAt,
    });
  });

  it('AC-5/D15: an endpoint reachable ONLY via the 2-hop reverse-import walk reaches the fact set', async () => {
    const facts = await assembleFacts({
      pull: PULL,
      repo: REPO,
      files: FILES,
      repoIntel: repoIntel(),
      github: githubResolved(null),
      readSpec: async () => null,
    });
    expect(facts.blast.impactedEndpoints).toContain('GET /api/two-hop-only');
    expect(facts.knownEndpoints.has('GET /api/two-hop-only')).toBe(true);
    // The 2-hop-only file itself becomes a legal blast-only citation target.
    expect(facts.blastFiles.has('src/reverse-caller.ts')).toBe(true);
    // Crons are the union of every factsByFile[*].crons — the only place they exist.
    expect(facts.blast.crons).toEqual(['nightly']);
  });

  it('AC-6/D11: a referenced spec is read and reaches the fact set; no other document is fetched', async () => {
    let requestedPath: string | null = null;
    const facts = await assembleFacts({
      pull: PULL,
      repo: REPO,
      files: FILES,
      repoIntel: repoIntel(),
      github: githubResolved(null),
      readSpec: async (_clonePath, path) => {
        requestedPath = path;
        return '# Blast Radius\ncontent';
      },
    });
    expect(requestedPath).toBe('specs/07-blast-radius.md');
    expect(facts.spec).toEqual({ available: true, path: 'specs/07-blast-radius.md', content: '# Blast Radius\ncontent' });
  });

  it('AC-7: an unresolvable issue and an unreadable spec both degrade to unavailable, assembly still succeeds', async () => {
    const facts = await assembleFacts({
      pull: PULL,
      repo: REPO,
      files: FILES,
      repoIntel: repoIntel(),
      github: githubResolved(null), // throws on getIssue
      readSpec: async () => null,
    });
    expect(facts.issue).toEqual({ available: false });
    expect(facts.spec.available).toBe(false);
  });

  it('AC-32: a degraded index still assembles a fact set (no throw); status and reason land on facts.blast', async () => {
    const facts = await assembleFacts({
      pull: PULL,
      repo: REPO,
      files: FILES,
      repoIntel: repoIntel(
        { degraded: true, reason: 'ripgrep fallback — no persistent index' },
        { status: 'degraded', reason: 'partial index coverage' },
      ),
      github: githubResolved(null),
      readSpec: async () => null,
    });
    expect(facts.blast.degraded).toBe(true);
    expect(facts.blast.indexStatus).toBe('degraded');
    expect(facts.blast.indexReason).toBe('partial index coverage');
  });

  it('AC-32: an absent index also assembles a fact set, carrying the absent status through', async () => {
    const facts = await assembleFacts({
      pull: PULL,
      repo: REPO,
      files: FILES,
      repoIntel: repoIntel(
        { changedSymbols: [], callers: [], impactedEndpoints: [], factsByFile: {}, degraded: true, reason: 'no index' },
        { status: 'absent', reason: 'repository has not been indexed', lastIndexedSha: '', indexerVersion: 0 },
      ),
      github: githubResolved(null),
      readSpec: async () => null,
    });
    expect(facts.blast.indexStatus).toBe('absent');
    expect(facts.blast.indexReason).toBe('repository has not been indexed');
  });

  it('a resolvable linked issue reaches the fact set', async () => {
    const facts = await assembleFacts({
      pull: PULL,
      repo: REPO,
      files: FILES,
      repoIntel: repoIntel(),
      github: githubResolved({ number: 7, title: 'Rate limit bypass', body: 'Attackers can bypass the limiter.' }),
      readSpec: async () => null,
    });
    expect(facts.issue).toEqual({
      available: true,
      number: 7,
      title: 'Rate limit bypass',
      body: 'Attackers can bypass the limiter.',
    });
  });
});
