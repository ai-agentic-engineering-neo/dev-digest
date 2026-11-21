/** Port — source of truth is server/src/domain/ports (SPEC-16). */
import type { RepoRef, UnifiedDiff } from '../../vendor/shared/adapters.js';

export interface CloneOptions {
  depth?: number;
  branch?: string;
}

export interface BlameLine {
  line: number;
  sha: string;
  author: string;
  date: string;
  summary: string;
}

export interface GitCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export interface GitClient {
  clone(repo: RepoRef, url: string, opts?: CloneOptions): Promise<{ path: string }>;
  fetchPullHead(repo: RepoRef, n: number): Promise<void>;
  /**
   * Resync an already-cloned repo to the tip of `branch`: fetch from origin and
   * advance the local working tree to `origin/<branch>`. Unlike `clone`'s bare
   * `fetch` (which only moves remote-tracking refs), this moves local HEAD so a
   * subsequent index reflects the latest code. Returns the new HEAD sha.
   */
  sync(repo: RepoRef, branch: string): Promise<{ head: string }>;
  currentHead(repo: RepoRef): Promise<string>;
  diff(repo: RepoRef, base: string, head: string): Promise<UnifiedDiff>;
  /**
   * Names of files changed between two commits (`git diff --name-only base..head`).
   * Two-dot form is intentional — we want files reachable from `head` but not `base`,
   * matching the incremental indexer's "what moved since last_indexed_sha?" semantics.
   * Returns an empty array when the two refs resolve to the same commit.
   */
  diffNameOnly(repo: RepoRef, base: string, head: string): Promise<string[]>;
  blame(repo: RepoRef, path: string): Promise<BlameLine[]>;
  log(repo: RepoRef, path?: string): Promise<GitCommit[]>;
  readFile(repo: RepoRef, path: string): Promise<string>;
  /**
   * Read `path` as it exists at commit `sha` (`git show <sha>:<path>`), without
   * touching the working tree. Returns `null` — never throws — when: `sha` is not
   * a 40-hex id; `path` is unsafe (absolute, `..` segment, NUL, leading `-`,
   * non-normalised); the commit/path doesn't exist; the object isn't a blob; or the
   * blob exceeds `maxBytes` (the caller's budget; repo-intel passes its
   * MAX_FILE_SIZE — the adapter owns no application constants).
   */
  readFileAtRef(repo: RepoRef, sha: string, path: string, maxBytes: number): Promise<string | null>;
  /** True when `sha` (40-hex) resolves to a commit object present in the clone. */
  hasObject(repo: RepoRef, sha: string): Promise<boolean>;
  clonePathFor(repo: RepoRef): string;
}
