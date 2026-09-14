import { describe, expect, it, vi } from 'vitest';
import { resolveDiff, REVIEW_MODES } from '../../src/cli/diff-source.js';
import type { GitResult, GitRunner } from '../../src/cli/git.js';
import { CliError, EXIT } from '../../src/cli/exit.js';

function fakeGit(impl: (args: string[], cwd: string) => Promise<GitResult>): GitRunner {
  return { run: vi.fn(impl) };
}

describe('REVIEW_MODES', () => {
  it('lists all three seam values, working first', () => {
    expect(REVIEW_MODES).toEqual(['working', 'staged', 'branch']);
  });
});

describe('resolveDiff', () => {
  it('working issues exactly ["diff", "HEAD"] in repoRoot and returns stdout as-is', async () => {
    const runSpy = vi.fn(async (args: string[], cwd: string) => {
      expect(args).toEqual(['diff', 'HEAD']);
      expect(cwd).toBe('/repo/root');
      return { exitCode: 0, stdout: 'diff --git a/x b/x\n', stderr: '' };
    });
    const git: GitRunner = { run: runSpy };

    const diff = await resolveDiff('working', { repoRoot: '/repo/root', git });

    expect(diff).toBe('diff --git a/x b/x\n');
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it('working surfaces a non-zero `git diff HEAD` exit as an environment error', async () => {
    const git = fakeGit(async () => ({ exitCode: 1, stdout: '', stderr: 'fatal: bad revision HEAD' }));
    try {
      await resolveDiff('working', { repoRoot: '/repo', git });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CliError);
      expect((err as CliError).code).toBe(EXIT.ENVIRONMENT);
    }
  });

  it('staged throws CliError(EXIT.USAGE) with the seam\'s exact "not implemented yet" message and calls git 0 times', async () => {
    const runSpy = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' }));
    const git: GitRunner = { run: runSpy };
    try {
      await resolveDiff('staged', { repoRoot: '/repo', git });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CliError);
      expect((err as CliError).code).toBe(EXIT.USAGE);
      expect((err as CliError).message).toBe(
        '--mode staged is not implemented yet (planned: git diff --cached). Use --mode working, which already includes your staged changes.',
      );
    }
    expect(runSpy).not.toHaveBeenCalled();
  });

  it('branch throws CliError(EXIT.USAGE) with the seam\'s exact "not implemented yet" message and calls git 0 times', async () => {
    const runSpy = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' }));
    const git: GitRunner = { run: runSpy };
    try {
      await resolveDiff('branch', { repoRoot: '/repo', git });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CliError);
      expect((err as CliError).code).toBe(EXIT.USAGE);
      expect((err as CliError).message).toBe(
        '--mode branch is not implemented yet (planned: git diff <merge-base>...HEAD). Use --mode working for uncommitted changes, or open a PR and review it in the web UI.',
      );
    }
    expect(runSpy).not.toHaveBeenCalled();
  });
});
