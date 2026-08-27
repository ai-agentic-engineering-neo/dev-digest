import { describe, expect, it, vi } from 'vitest';
import { NotFoundError, AppError } from '../../platform/errors.js';
import { actOnFinding } from './findings.js';
import type { FindingRow, PullRow, ReviewRepository, ReviewRow } from './repository.js';

/**
 * Hermetic unit tests for `actOnFinding` — same "fake repo, no DB" approach
 * as `service.test.ts`. Covers accept/dismiss (regression, unchanged) and the
 * new `learn` action (specs/13-multi-agent-review.md, D24, D-P5).
 */

const FINDING = {
  id: 'f1',
  reviewId: 'rev1',
  file: 'src/config.ts',
  startLine: 11,
  endLine: 11,
  severity: 'CRITICAL',
  category: 'security',
  title: 'Hardcoded Stripe secret key',
  rationale: 'A live Stripe key is committed in source.',
  suggestion: 'Move the key to an environment variable.',
  confidence: 0.95,
  kind: 'secret_leak',
  trifectaComponents: null,
  acceptedAt: null,
  dismissedAt: null,
} as FindingRow;

const REVIEW = {
  id: 'rev1',
  workspaceId: 'ws1',
  prId: 'pr1',
  agentId: 'agent1',
  runId: 'run1',
  kind: 'review',
  verdict: 'request_changes',
  summary: 'One blocker.',
  score: 65,
  model: 'gpt-4.1',
  createdAt: new Date(),
} as ReviewRow;

const PULL = { id: 'pr1', workspaceId: 'ws1', repoId: 'repo1' } as PullRow;

function buildRepo(overrides?: {
  findingContext?: () => Promise<{ finding: FindingRow; review: ReviewRow; pull: PullRow } | undefined>;
  findLearningForFinding?: () => Promise<{ id: string } | undefined>;
  insertLearningFromFinding?: (values: unknown) => Promise<{ id: string }>;
}) {
  const insertLearningFromFinding = vi.fn(overrides?.insertLearningFromFinding ?? (async () => ({ id: 'mem1' })));
  const repo = {
    findingContext: overrides?.findingContext ?? (async () => ({ finding: FINDING, review: REVIEW, pull: PULL })),
    setFindingAccepted: vi.fn(async () => ({ ...FINDING, acceptedAt: new Date() })),
    setFindingDismissed: vi.fn(async () => ({ ...FINDING, dismissedAt: new Date() })),
    findLearningForFinding: overrides?.findLearningForFinding ?? (async () => undefined),
    insertLearningFromFinding,
  } as unknown as ReviewRepository;
  return { repo, insertLearningFromFinding };
}

describe('actOnFinding — accept/dismiss (regression, unchanged by specs/13)', () => {
  it('accept sets accepted_at', async () => {
    const { repo } = buildRepo();
    const result = await actOnFinding(repo, 'ws1', 'f1', 'accept');
    expect(result.finding.accepted_at).not.toBeNull();
    expect(result.memoryId).toBeUndefined();
  });

  it('dismiss sets dismissed_at', async () => {
    const { repo } = buildRepo();
    const result = await actOnFinding(repo, 'ws1', 'f1', 'dismiss');
    expect(result.finding.dismissed_at).not.toBeNull();
    expect(result.memoryId).toBeUndefined();
  });

  it('throws NotFoundError for another workspace (AC-55)', async () => {
    const { repo } = buildRepo({
      findingContext: async () => ({ finding: FINDING, review: REVIEW, pull: { ...PULL, workspaceId: 'other-ws' } }),
    });
    await expect(actOnFinding(repo, 'ws1', 'f1', 'accept')).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError when the finding does not exist', async () => {
    const { repo } = buildRepo({ findingContext: async () => undefined });
    await expect(actOnFinding(repo, 'ws1', 'missing', 'accept')).rejects.toThrow(NotFoundError);
  });

  it('the reply action still 400s (N5 — unimplemented)', async () => {
    const { repo } = buildRepo();
    await expect(actOnFinding(repo, 'ws1', 'f1', 'reply')).rejects.toThrow(AppError);
  });
});

describe('actOnFinding — learn (D24, D-P5, AC-63, AC-64)', () => {
  it('writes exactly one memory row on first activation, sourced from the finding, returning memoryId', async () => {
    const { repo, insertLearningFromFinding } = buildRepo();
    const result = await actOnFinding(repo, 'ws1', 'f1', 'learn');
    expect(result.memoryId).toBe('mem1');
    expect(insertLearningFromFinding).toHaveBeenCalledTimes(1);
    const [values] = insertLearningFromFinding.mock.calls[0]!;
    expect((values as any).workspaceId).toBe('ws1');
    expect((values as any).repoId).toBe('repo1');
    expect((values as any).sources).toEqual({
      finding_id: 'f1',
      review_id: 'rev1',
      run_id: 'run1',
      agent_id: 'agent1',
    });
    // AC-63/64: content is assembled deterministically from the finding's own
    // fields — the file, line range, and rationale must be present verbatim.
    expect((values as any).content).toContain('src/config.ts');
    expect((values as any).content).toContain('11');
    expect((values as any).content).toContain('A live Stripe key is committed in source.');
  });

  it('activating Learn twice does not write a second row — the existing one is reused (D24 edge case)', async () => {
    const { repo, insertLearningFromFinding } = buildRepo({
      findLearningForFinding: async () => ({ id: 'mem-existing' }),
    });
    const result = await actOnFinding(repo, 'ws1', 'f1', 'learn');
    expect(result.memoryId).toBe('mem-existing');
    expect(insertLearningFromFinding).not.toHaveBeenCalled();
  });

  it('makes no LLM/provider call — content is assembled purely from persisted fields (AC-64)', async () => {
    // No LLM port is even passed to actOnFinding/ReviewRepository here — the
    // absence of any such dependency in this test's fakes IS the proof.
    const { repo } = buildRepo();
    await expect(actOnFinding(repo, 'ws1', 'f1', 'learn')).resolves.toBeDefined();
  });
});
