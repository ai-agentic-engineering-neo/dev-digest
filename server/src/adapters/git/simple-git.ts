import { simpleGit, type SimpleGit } from 'simple-git';
import { join, resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { mkdir, readFile, access, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import type {
  GitClient,
  RepoRef,
  CloneOptions,
  UnifiedDiff,
  BlameLine,
  GitCommit,
} from '@devdigest/shared';
import { parseUnifiedDiff } from './diff-parser.js';

/**
 * Depth fetched by `sync()`. Deeper than the shallow clone (CLONE_DEPTH=1) so the
 * previously-indexed sha is usually reachable, keeping the resync diff incremental;
 * when it isn't, the indexer falls back to a full reindex.
 */
const RESYNC_FETCH_DEPTH = 50;

/** Username GitHub expects alongside a PAT in HTTP Basic auth. */
const GIT_TOKEN_USERNAME = 'x-access-token';

/** URL prefix the auth header is scoped to — git never sends it to other hosts. */
const GITHUB_HTTPS_PREFIX = 'https://github.com/';

/** A clone-path segment: non-empty, no separators, not `.`/`..`. */
const SAFE_SEGMENT = /^[A-Za-z0-9_.-]+$/;

/** Resolves the GitHub PAT at call time (rotations apply without a restart). */
export type TokenProvider = () => Promise<string | null | undefined>;

/**
 * Per-command git config (`git -c …`) authenticating https://github.com/ with a
 * PAT. Passed as a global `-c` option, it lives only for that one git process —
 * unlike a token-embedded clone URL, which git persists into `.git/config`.
 */
export function githubAuthConfig(token: string): string[] {
  const basic = Buffer.from(`${GIT_TOKEN_USERNAME}:${token}`).toString('base64');
  return [`http.${GITHUB_HTTPS_PREFIX}.extraHeader=Authorization: Basic ${basic}`];
}

/** Drop `user:password@` from a URL; non-URL remotes (scp-style ssh) pass through. */
export function stripUrlCredentials(url: string): string {
  try {
    const u = new URL(url);
    if (!u.username && !u.password) return url;
    u.username = '';
    u.password = '';
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * GitClient over simple-git. Repos clone to
 * `<cloneDir>/<owner>/<repo>`. We NEVER execute repo code — only git ops.
 */
export class SimpleGitClient implements GitClient {
  constructor(
    private cloneDir: string,
    private getToken: TokenProvider = async () => undefined,
  ) {
    // Force non-interactive auth so an unauthenticated/private clone fails in
    // ~1s with a clear error instead of hanging on a credential prompt until the
    // job timeout. Set on process.env (inherited by git subprocesses) rather
    // than via simple-git's .env(), which inspects and rejects vars like
    // PAGER/EDITOR present in the shell environment.
    process.env.GIT_TERMINAL_PROMPT ??= '0';
    process.env.GCM_INTERACTIVE ??= 'never';
  }

  /**
   * `<cloneDir>/<owner>/<name>`, guaranteed to stay inside cloneDir: `clone()`
   * rm -rf's a stale dest, so a traversal here would delete arbitrary paths.
   */
  clonePathFor(repo: RepoRef): string {
    for (const seg of [repo.owner, repo.name]) {
      if (!SAFE_SEGMENT.test(seg) || seg === '.' || seg === '..') {
        throw new Error(`Invalid repo path segment '${seg}'`);
      }
    }
    const root = resolve(this.cloneDir);
    const dest = resolve(root, repo.owner, repo.name);
    const rel = relative(root, dest);
    if (!rel || rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).length !== 2) {
      throw new Error(`Clone path for ${repo.owner}/${repo.name} is outside the clone directory`);
    }
    return dest;
  }

  private git(repo: RepoRef): SimpleGit {
    return simpleGit(this.clonePathFor(repo));
  }

  /**
   * simple-git bound to `baseDir`, carrying the GitHub auth header when a PAT is
   * set. With `signal`, aborting it kills the running git child process.
   */
  private async authedGit(baseDir: string, signal?: AbortSignal): Promise<SimpleGit> {
    const token = await this.getToken();
    return simpleGit({
      baseDir,
      config: token ? githubAuthConfig(token) : [],
      ...(signal ? { abort: signal } : {}),
    });
  }

  /**
   * Rewrite a token-bearing `origin` (clones made before per-command auth
   * embedded the PAT in the URL) to its clean form. No-op otherwise.
   */
  async scrubOrigin(repo: RepoRef): Promise<void> {
    const g = this.git(repo);
    const current = String((await g.remote(['get-url', 'origin'])) ?? '').trim();
    const clean = stripUrlCredentials(current);
    if (current && clean !== current) await g.remote(['set-url', 'origin', clean]);
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async clone(repo: RepoRef, url: string, opts?: CloneOptions): Promise<{ path: string }> {
    const dest = this.clonePathFor(repo);
    await mkdir(dirname(dest), { recursive: true });
    if (await this.exists(join(dest, '.git'))) {
      // already cloned → fetch latest
      await this.scrubOrigin(repo);
      await (await this.authedGit(dest, opts?.signal)).fetch();
      return { path: dest };
    }
    // A prior clone may have timed out mid-write, leaving a partial dir without
    // a .git — git clone refuses a non-empty dest, so clear it first.
    if (await this.exists(dest)) await rm(dest, { recursive: true, force: true });
    const args: string[] = [];
    if (opts?.depth) args.push('--depth', String(opts.depth));
    if (opts?.branch) args.push('--branch', opts.branch);
    // simple-git passes url/dest as pathspecs, i.e. after `--`, so neither can
    // be read as an option. Clone with the credential-free URL: auth rides on
    // the per-command header and never reaches .git/config.
    await (await this.authedGit(this.cloneDir, opts?.signal)).clone(stripUrlCredentials(url), dest, args);
    return { path: dest };
  }

  async fetchPullHead(repo: RepoRef, n: number): Promise<void> {
    // Fetch the PR head ref into a local ref (GitHub exposes pull/<n>/head).
    await this.scrubOrigin(repo);
    const g = await this.authedGit(this.clonePathFor(repo));
    await g.fetch(['origin', `pull/${n}/head:pr-${n}`]);
  }

  async sync(repo: RepoRef, branch: string, opts?: { signal?: AbortSignal }): Promise<{ head: string }> {
    // Resync the read-only mirror to upstream. A bare `fetch` only moves
    // `origin/<branch>`, so we `reset --hard` to advance local HEAD + worktree —
    // safe here because we never commit to or run code from the clone.
    // Fetch a bounded depth (> the shallow CLONE_DEPTH) so the prior indexed sha
    // is usually reachable for an incremental diff; the indexer falls back to a
    // full reindex when it isn't.
    await this.scrubOrigin(repo);
    const g = await this.authedGit(this.clonePathFor(repo), opts?.signal);
    await g.fetch(['origin', branch, '--depth', String(RESYNC_FETCH_DEPTH)]);
    await g.reset(['--hard', `origin/${branch}`]);
    return { head: (await g.revparse(['HEAD'])).trim() };
  }

  async currentHead(repo: RepoRef): Promise<string> {
    return (await this.git(repo).revparse(['HEAD'])).trim();
  }

  async diff(repo: RepoRef, base: string, head: string): Promise<UnifiedDiff> {
    const raw = await this.git(repo).diff([`${base}...${head}`]);
    return parseUnifiedDiff(raw);
  }

  /**
   * `git diff --name-only base..head` — used by the incremental indexer to
   * pick the file set that changed since `last_indexed_sha`. Two-dot is
   * intentional (commits reachable from `head` but not `base`), unlike the
   * three-dot symmetric form `diff()` uses for review diffs.
   */
  async diffNameOnly(repo: RepoRef, base: string, head: string): Promise<string[]> {
    if (base === head) return [];
    const raw = await this.git(repo).raw(['diff', '--name-only', `${base}..${head}`]);
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  async blame(repo: RepoRef, path: string): Promise<BlameLine[]> {
    const raw = await this.git(repo).raw(['blame', '--line-porcelain', path]);
    return parseBlamePorcelain(raw);
  }

  async log(repo: RepoRef, path?: string): Promise<GitCommit[]> {
    const log = await this.git(repo).log(path ? { file: path } : undefined);
    return log.all.map((c) => ({
      sha: c.hash,
      message: c.message,
      author: c.author_name,
      date: c.date,
    }));
  }

  /**
   * Read a file of the clone. `path` comes from diffs / model output, so it is
   * resolved and must stay strictly inside the repo's clone (no `..`, no
   * absolute path, not the clone dir itself) — otherwise this throws.
   */
  async readFile(repo: RepoRef, path: string): Promise<string> {
    const root = this.clonePathFor(repo);
    const full = resolve(root, path);
    const rel = relative(root, full);
    if (!rel || rel.split(sep)[0] === '..' || isAbsolute(rel)) {
      throw new Error(`Path '${path}' is outside the clone of ${repo.owner}/${repo.name}`);
    }
    return readFile(full, 'utf8');
  }
}

function parseBlamePorcelain(raw: string): BlameLine[] {
  const out: BlameLine[] = [];
  const lines = raw.split('\n');
  let sha = '';
  let author = '';
  let date = '';
  let summary = '';
  let lineNo = 0;
  for (const line of lines) {
    const header = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/);
    if (header) {
      sha = header[1]!;
      lineNo = Number(header[2]);
    } else if (line.startsWith('author ')) author = line.slice(7);
    else if (line.startsWith('author-time '))
      date = new Date(Number(line.slice(12)) * 1000).toISOString();
    else if (line.startsWith('summary ')) summary = line.slice(8);
    else if (line.startsWith('\t')) {
      out.push({ line: lineNo, sha, author, date, summary });
    }
  }
  return out;
}
