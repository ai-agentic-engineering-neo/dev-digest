import { InvalidRepoUrl } from './errors.js';
import {
  GITHUB_HOST,
  GITHUB_OWNER_RE,
  GITHUB_REPO_RE,
  GITHUB_SSH_RE,
} from './constants.js';

/**
 * F1 — repos domain policies: which URLs may be imported and the one URL
 * shape we ever clone from. Pure functions only — no I/O.
 */

/** A validated GitHub repo reference plus the canonical URL to clone from. */
export interface ParsedRepoUrl {
  owner: string;
  name: string;
  /**
   * Rebuilt from the validated parts — never the raw user input. Only this
   * string ever reaches `git clone`, so nothing the user typed (other hosts,
   * `file://`, `ext::`, credentials, ports, extra path segments) can.
   */
  cloneUrl: string;
}

function invalidRepoUrl(url: string): InvalidRepoUrl {
  return new InvalidRepoUrl(
    `Not a GitHub repository URL: '${url.slice(0, 200)}' (expected https://github.com/<owner>/<repo>)`,
  );
}

function stripGitSuffix(name: string): string {
  return name.endsWith('.git') ? name.slice(0, -'.git'.length) : name;
}

/** True iff `owner`/`name` are valid GitHub identifiers that are also safe path segments. */
export function isValidRepoRef(owner: string, name: string): boolean {
  return (
    GITHUB_OWNER_RE.test(owner) &&
    GITHUB_REPO_RE.test(name) &&
    name !== '.' &&
    name !== '..'
  );
}

/**
 * Parse `owner`/`name` from a GitHub URL. Accepts exactly:
 *   - `https://github.com/<owner>/<repo>` with an optional `.git` and/or trailing `/`
 *   - `git@github.com:<owner>/<repo>(.git)`
 * Anything else — another host, a `github.com` substring elsewhere in the URL,
 * credentials, a port, query/fragment, extra path segments, `.`/`..` — is a
 * 400. S1 (security hardening): the previous unanchored regex let
 * `https://x.tld/github.com/../node_modules` through, which turned into an
 * `rm -rf` of a sibling directory followed by a clone of an arbitrary URL.
 */
export function parseRepoUrl(url: string): ParsedRepoUrl {
  const raw = url.trim();
  let owner: string | undefined;
  let name: string | undefined;

  const ssh = raw.match(GITHUB_SSH_RE);
  if (ssh) {
    owner = ssh[1];
    name = ssh[2];
  } else {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      throw invalidRepoUrl(raw);
    }
    if (
      u.protocol !== 'https:' ||
      u.hostname !== GITHUB_HOST ||
      u.username !== '' ||
      u.password !== '' ||
      u.port !== '' ||
      u.search !== '' ||
      u.hash !== ''
    ) {
      throw invalidRepoUrl(raw);
    }
    // `new URL` already collapsed any `..` it could, so check the raw input
    // too: `https://github.com/a/../b` must not silently become `/b`.
    if (/(^|\/)\.\.?(\/|$)/.test(raw.replace(/^https:\/\/github\.com/, ''))) {
      throw invalidRepoUrl(raw);
    }
    const segments = u.pathname.replace(/\/$/, '').split('/');
    // ['', owner, name]
    if (segments.length !== 3) throw invalidRepoUrl(raw);
    owner = segments[1];
    name = segments[2] !== undefined ? stripGitSuffix(segments[2]) : undefined;
  }

  if (!owner || !name || !isValidRepoRef(owner, name)) throw invalidRepoUrl(raw);
  return { owner, name, cloneUrl: canonicalCloneUrl(owner, name) };
}

/** The one URL shape we ever clone or fetch from. */
export function canonicalCloneUrl(owner: string, name: string): string {
  return `https://${GITHUB_HOST}/${owner}/${name}.git`;
}
