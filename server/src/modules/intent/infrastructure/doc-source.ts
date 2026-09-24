/**
 * DocSource: read a linked plan/spec doc at the PR's head sha. Tries the local
 * clone first (`GitClient.readFileAt`, exact commit), falls back to GitHub's
 * Contents API (`GitHubClient.getFileContent`) when there is no clone yet or
 * the local read fails. Same-repo only (the caller already resolved `repo`
 * from the PR itself — never from a model/echoed URL); extension-gated and
 * size-capped (server/specs/05-intent-layer.md).
 */
import type { FileAtRef, GitClient, GitHubClient } from '@devdigest/shared';
import { DOC_EXTENSIONS, DOC_FETCH_MAX_BYTES } from '../domain/constants.js';
import type { DocReadResult, DocSource, IntentRepo } from '../application/ports.js';

export interface GitDocSourceDeps {
  git: Pick<GitClient, 'readFileAt'>;
  github: () => Promise<Pick<GitHubClient, 'getFileContent'>>;
}

function hasDocExtension(path: string): boolean {
  const lower = path.toLowerCase();
  return DOC_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Reject absolute paths, `..`, backslashes, NUL, a leading `-`, and `.git` segments. */
function isSafeDocPath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('..') || path.includes('\\') || path.includes('\0')) return false;
  if (path.startsWith('-')) return false;
  return !path.split('/').some((seg) => seg === '.git');
}

export class GitDocSource implements DocSource {
  constructor(private readonly deps: GitDocSourceDeps) {}

  async read(repo: IntentRepo, headSha: string, path: string): Promise<DocReadResult> {
    if (!hasDocExtension(path)) return { ok: false, reason: `unsupported file type '${path}'` };
    if (!isSafeDocPath(path)) return { ok: false, reason: 'unsafe path' };

    let file: FileAtRef | null = null;
    try {
      file = await this.deps.git.readFileAt(
        { owner: repo.owner, name: repo.name },
        headSha,
        path,
        { maxBytes: DOC_FETCH_MAX_BYTES },
      );
    } catch (err) {
      // The clone already rejected the object as too large — GitHub would
      // just repeat the same rejection (or worse, serve the whole file with
      // no size guard), so don't fall back for THAT reason. Any other
      // failure (no clone yet, object missing, git error) still falls back.
      if ((err as { code?: string } | undefined)?.code === 'too_large') {
        return { ok: false, reason: err instanceof Error ? err.message : 'file too large' };
      }
      try {
        const github = await this.deps.github();
        file = await github.getFileContent(
          { owner: repo.owner, name: repo.name },
          path,
          headSha,
          { maxBytes: DOC_FETCH_MAX_BYTES },
        );
      } catch {
        file = null;
      }
    }
    if (!file) return { ok: false, reason: 'not found' };
    if (file.content.length > DOC_FETCH_MAX_BYTES) {
      return { ok: true, content: file.content.slice(0, DOC_FETCH_MAX_BYTES), truncated: true };
    }
    return { ok: true, content: file.content, truncated: false };
  }
}
