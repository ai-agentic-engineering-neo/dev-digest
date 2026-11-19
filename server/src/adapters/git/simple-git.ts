import { simpleGit, type SimpleGit } from 'simple-git';
import { join, resolve, sep } from 'node:path';
import { mkdir, readFile, access, rm, realpath } from 'node:fs/promises';
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

/** Only origin whose clones/fetches ever receive the GitHub token. */
const GITHUB_ORIGIN = 'https://github.com/';

/**
 * Environment passed to authenticated git subprocesses. An explicit
 * allow-list rather than `...process.env`: simple-git's unsafe-operations
 * guard rejects the whole call when vars such as `EDITOR`/`PAGER`/
 * `GIT_SSH_COMMAND` are present, and nothing else from the server's
 * environment needs to reach git.
 */
const PASSTHROUGH_ENV = [
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'TMPDIR',
  'SYSTEMROOT',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'GIT_SSL_CAINFO',
] as const;

export interface SimpleGitClientOptions {
  /**
   * Resolves the GitHub token for network operations (clone/fetch). Read on
   * every call so a token saved in Settings applies without a restart.
   */
  getToken?: () => Promise<string | undefined>;
}

/** A repo ref whose owner/name is not a plain directory name. */
export class UnsafeClonePathError extends Error {
  constructor(repo: RepoRef) {
    super(`Refusing a clone path outside the clone directory for '${repo.owner}/${repo.name}'`);
    this.name = 'UnsafeClonePathError';
  }
}

/**
 * Git environment variables this adapter sets on purpose. simple-git 4's
 * environment guard both REJECTS such vars when passed via `.env()` and
 * silently STRIPS them from the inherited `process.env` unless allowed — the
 * latter would quietly drop `GIT_TERMINAL_PROMPT=0` and let a private clone
 * hang on a credential prompt. Everything else stays guarded.
 */
const ALLOWED_GIT_ENV = [
  'GIT_TERMINAL_PROMPT',
  'GCM_INTERACTIVE',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_KEY_0',
  'GIT_CONFIG_VALUE_0',
];

/** `-c` keys this adapter passes itself (simple-git 4 warns on, and its next
 *  major blocks, config keys outside its known-safe list). */
const ALLOWED_GIT_CONFIG = ['core.symlinks'];

/** The only way this adapter builds a simple-git instance. */
function gitAt(baseDir: string): SimpleGit {
  return simpleGit({ baseDir, allowEnvironment: ALLOWED_GIT_ENV, allowConfig: ALLOWED_GIT_CONFIG });
}

function isPlainSegment(s: string): boolean {
  return (
    s.length > 0 && s !== '.' && s !== '..' && !s.includes('/') && !s.includes('\\') && !s.includes('\0')
  );
}

/**
 * GitClient over simple-git. Repos clone to
 * `<cloneDir>/<owner>/<repo>`. We NEVER execute repo code — only git ops.
 *
 * S1 (security hardening):
 *  - `clonePathFor` proves the path stays inside `cloneDir` before any
 *    `rm`/`clone` — the second line of defence behind `parseRepoUrl`.
 *  - The GitHub token goes in as an `http.https://github.com/.extraHeader`
 *    through `GIT_CONFIG_*` env for one command at a time. It is never put in
 *    the remote URL, so it never lands in the clone's `.git/config`, and it is
 *    scoped to github.com so a redirect cannot carry it to another host.
 */
export class SimpleGitClient implements GitClient {
  private readonly root: string;

  constructor(
    cloneDir: string,
    private opts: SimpleGitClientOptions = {},
  ) {
    this.root = resolve(cloneDir);
    // Force non-interactive auth so an unauthenticated/private clone fails in
    // ~1s with a clear error instead of hanging on a credential prompt until the
    // job timeout. Set on process.env (inherited by git subprocesses); kept
    // there by ALLOWED_GIT_ENV, which simple-git 4 would otherwise strip.
    process.env.GIT_TERMINAL_PROMPT ??= '0';
    process.env.GCM_INTERACTIVE ??= 'never';
  }

  clonePathFor(repo: RepoRef): string {
    if (!isPlainSegment(repo.owner) || !isPlainSegment(repo.name)) {
      throw new UnsafeClonePathError(repo);
    }
    const dest = resolve(this.root, repo.owner, repo.name);
    if (!dest.startsWith(this.root + sep)) throw new UnsafeClonePathError(repo);
    return dest;
  }

  private git(repo: RepoRef): SimpleGit {
    return gitAt(this.clonePathFor(repo));
  }

  /**
   * A simple-git instance for commands that talk to the network. With a token,
   * auth goes in through `GIT_CONFIG_COUNT/KEY/VALUE` — guarded by simple-git
   * and allowed only via ALLOWED_GIT_ENV, for config this class builds itself.
   */
  private async netGit(baseDir: string): Promise<SimpleGit> {
    const token = await this.opts.getToken?.();
    if (!token) return gitAt(baseDir);
    const env: Record<string, string> = {};
    for (const key of PASSTHROUGH_ENV) {
      const v = process.env[key];
      if (v !== undefined) env[key] = v;
    }
    const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
    env.GIT_TERMINAL_PROMPT = '0';
    env.GCM_INTERACTIVE = 'never';
    env.GIT_CONFIG_COUNT = '1';
    env.GIT_CONFIG_KEY_0 = `http.${GITHUB_ORIGIN}.extraHeader`;
    env.GIT_CONFIG_VALUE_0 = `Authorization: Basic ${basic}`;
    return gitAt(baseDir).env(env);
  }

  /**
   * Clones made before S1 carry the PAT inside `origin`
   * (`https://x-access-token:<pat>@github.com/...`). Rewrite such a remote to
   * the canonical credential-free URL; auth now comes from `netGit`.
   */
  private async scrubRemote(dest: string, repo: RepoRef): Promise<void> {
    const g = gitAt(dest);
    const current = await g.remote(['get-url', 'origin']).catch(() => undefined);
    if (typeof current === 'string' && /^https:\/\/[^/]*@/.test(current.trim())) {
      await g.remote(['set-url', 'origin', `${GITHUB_ORIGIN}${repo.owner}/${repo.name}.git`]);
    }
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
    await mkdir(join(this.root, repo.owner), { recursive: true });
    if (await this.exists(join(dest, '.git'))) {
      // already cloned → fetch latest
      await this.scrubRemote(dest, repo);
      await (await this.netGit(dest)).fetch();
      return { path: dest };
    }
    // A prior clone may have timed out mid-write, leaving a partial dir without
    // a .git — git clone refuses a non-empty dest, so clear it first.
    if (await this.exists(dest)) await rm(dest, { recursive: true, force: true });
    // `core.symlinks=false`: a symlink committed to the (untrusted) repo is
    // checked out as a small text file holding its target, not a live link
    // out of the clone (S6). Reads are containment-checked regardless, since
    // clones made before this change still have real symlinks.
    const args: string[] = ['clone', '-c', 'core.symlinks=false'];
    if (opts?.depth) args.push('--depth', String(opts.depth));
    if (opts?.branch) args.push('--branch', opts.branch);
    // `--end-of-options`: the URL and destination can never be read as flags.
    args.push('--end-of-options', url, dest);
    await (await this.netGit(this.root)).raw(args);
    return { path: dest };
  }

  async fetchPullHead(repo: RepoRef, n: number): Promise<void> {
    // Fetch the PR head ref into a local ref (GitHub exposes pull/<n>/head).
    const dest = this.clonePathFor(repo);
    await this.scrubRemote(dest, repo);
    await (await this.netGit(dest)).fetch(['origin', `pull/${n}/head:pr-${n}`]);
  }

  async sync(repo: RepoRef, branch: string): Promise<{ head: string }> {
    // Resync the read-only mirror to upstream. A bare `fetch` only moves
    // `origin/<branch>`, so we `reset --hard` to advance local HEAD + worktree —
    // safe here because we never commit to or run code from the clone.
    // Fetch a bounded depth (> the shallow CLONE_DEPTH) so the prior indexed sha
    // is usually reachable for an incremental diff; the indexer falls back to a
    // full reindex when it isn't.
    const dest = this.clonePathFor(repo);
    await this.scrubRemote(dest, repo);
    await (await this.netGit(dest)).fetch(['origin', branch, '--depth', String(RESYNC_FETCH_DEPTH)]);
    const g = this.git(repo);
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
    const raw = await this.git(repo).raw(['blame', '--line-porcelain', '--', path]);
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

  async readFile(repo: RepoRef, path: string): Promise<string> {
    // S6 — the clone is untrusted: prove the real path (after symlinks) is
    // still inside it before reading.
    const root = await realpath(this.clonePathFor(repo));
    const target = await realpath(resolve(root, path));
    if (!target.startsWith(root + sep)) {
      throw new Error(`Path escapes the repository checkout: ${path}`);
    }
    return readFile(target, 'utf8');
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
