import { describe, it, expect } from 'vitest';
import { SmartDiffService } from '../src/modules/smart-diff/application/smart-diff-service.js';
import type { SmartDiffSource } from '../src/modules/smart-diff/application/ports.js';
import { NotFoundError } from '../src/platform/errors.js';

function fakeSource(overrides: Partial<SmartDiffSource> = {}): SmartDiffSource {
  return {
    pullExists: async () => true,
    listFiles: async () => [],
    latestReviewFindings: async () => [],
    ...overrides,
  };
}

describe('SmartDiffService.get', () => {
  it('throws NotFoundError when the PR does not exist in this workspace', async () => {
    const service = new SmartDiffService({ source: fakeSource({ pullExists: async () => false }) });
    await expect(service.get('ws-1', 'pr-missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a PR with no review yields groups with empty finding_lines everywhere', async () => {
    const service = new SmartDiffService({
      source: fakeSource({
        listFiles: async () => [{ path: 'src/config.ts', additions: 2, deletions: 0 }],
        latestReviewFindings: async () => [],
      }),
    });
    const result = await service.get('ws-1', 'pr-1');
    const core = result.groups.find((g) => g.role === 'core')!;
    expect(core.files).toEqual([{ path: 'src/config.ts', additions: 2, deletions: 0, finding_lines: [] }]);
  });
});
