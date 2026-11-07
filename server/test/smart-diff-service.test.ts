import { describe, it, expect, vi } from 'vitest';
import { NotFoundError } from '../src/platform/errors.js';
import { SmartDiffService } from '../src/modules/smart-diff/service.js';
import type { ReviewWithFindings } from '../src/modules/smart-diff/domain.js';

function makeDeps(opts: { found: boolean; rows?: ReviewWithFindings[] }) {
  const getPull = vi.fn(async (_workspaceId: string, id: string) => (opts.found ? { id } : undefined));
  const reviewsForPull = vi.fn(async (_prId: string) => opts.rows ?? []);
  const listFiles = vi.fn(async (_workspaceId: string, _prId: string) => [
    { path: 'src/a.ts', additions: 2, deletions: 1 },
    { path: 'README.md', additions: 1, deletions: 0 },
  ]);
  return {
    getPull,
    reviewsForPull,
    listFiles,
    deps: { reviewRepo: { getPull, reviewsForPull }, smartDiffRepo: { listFiles } },
  };
}

const review = (
  id: string,
  agentId: string,
  createdAt: string,
  startLine: number,
): ReviewWithFindings => ({
  review: { id, agentId, kind: 'review', createdAt: new Date(createdAt) },
  findings: [{ file: 'src/a.ts', startLine, dismissedAt: null }],
});

describe('SmartDiffService.forPull', () => {
  it('throws NotFoundError before any child read for an unknown PR', async () => {
    const m = makeDeps({ found: false });
    await expect(new SmartDiffService(m.deps).forPull('w1', 'p1')).rejects.toBeInstanceOf(NotFoundError);
    expect(m.getPull).toHaveBeenCalledWith('w1', 'p1');
    expect(m.listFiles).not.toHaveBeenCalled();
    expect(m.reviewsForPull).not.toHaveBeenCalled();
  });

  it('returns five groups with lines from the latest review per agent', async () => {
    const m = makeDeps({
      found: true,
      rows: [
        review('r1', 'A', '2026-01-01T00:00:00Z', 5),
        review('r2', 'A', '2026-01-02T00:00:00Z', 9),
        review('r3', 'B', '2026-01-01T00:00:00Z', 2),
      ],
    });
    const out = await new SmartDiffService(m.deps).forPull('w1', 'p1');
    // The file read is itself workspace-scoped (not only guarded by getPull).
    expect(m.listFiles).toHaveBeenCalledWith('w1', 'p1');
    expect(out.groups).toHaveLength(5);
    const core = out.groups.find((g) => g.role === 'core');
    expect(core?.files[0]?.finding_lines).toEqual([2, 9]);
    expect(out.groups.find((g) => g.role === 'docs')?.files[0]?.path).toBe('README.md');
  });

  it('gives empty finding_lines when there is no review', async () => {
    const m = makeDeps({ found: true });
    const out = await new SmartDiffService(m.deps).forPull('w1', 'p1');
    expect(out.groups.flatMap((g) => g.files).every((x) => x.finding_lines.length === 0)).toBe(true);
  });
});
