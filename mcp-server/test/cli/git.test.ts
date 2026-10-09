import { describe, expect, it, vi } from 'vitest';
import { findRepoRoot, type GitResult, type GitRunner } from '../../src/cli/git.js';
import { CliError, EXIT } from '../../src/cli/exit.js';

function fakeGit(impl: (args: string[], cwd: string) => Promise<GitResult>): GitRunner {
  return { run: vi.fn(impl) };
}

describe('findRepoRoot', () => {
  it('returns the trimmed stdout of `git rev-parse --show-toplevel` on success', async () => {
    const git = fakeGit(async (args) => {
      expect(args).toEqual(['rev-parse', '--show-toplevel']);
      return { exitCode: 0, stdout: '/repo/root\n', stderr: '' };
    });
    await expect(findRepoRoot('/repo/root/sub', git)).resolves.toBe('/repo/root');
  });

  it('throws CliError(EXIT.ENVIRONMENT) with the "not a git repository" message on a non-zero exit', async () => {
    const git = fakeGit(async () => ({
      exitCode: 128,
      stdout: '',
      stderr: 'fatal: not a git repository (or any of the parent directories): .git',
    }));
    try {
      await findRepoRoot('/tmp', git);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CliError);
      expect((err as CliError).code).toBe(EXIT.ENVIRONMENT);
      expect((err as CliError).message).toBe(
        "Not a git repository (or any parent up to the filesystem root). Run this from inside your repo's working copy.",
      );
    }
  });

  it('throws CliError(EXIT.ENVIRONMENT) with the "git not on PATH" message on ENOENT', async () => {
    const git = fakeGit(async () => {
      const err = new Error('spawn git ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    });
    try {
      await findRepoRoot('/repo', git);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CliError);
      expect((err as CliError).code).toBe(EXIT.ENVIRONMENT);
      expect((err as CliError).message).toBe(
        '`git` was not found on your PATH. Install git, or run this from a shell where `git --version` works.',
      );
    }
  });

  it('rethrows a non-ENOENT spawn error as-is (not swallowed into a CliError)', async () => {
    const boom = new Error('permission denied');
    const git = fakeGit(async () => {
      throw boom;
    });
    await expect(findRepoRoot('/repo', git)).rejects.toBe(boom);
  });
});
