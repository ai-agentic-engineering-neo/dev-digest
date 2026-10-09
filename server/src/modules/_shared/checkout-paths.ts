import { realpath } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';

/**
 * specs/09-project-context-folder.md — path containment.
 *
 * "Security — path containment" (the spec's non-functional section): every
 * read of an attached document, and every configured search root, must be
 * PROVEN to resolve inside the pinned repo's checkout directory before the
 * read happens. Today's checkout-read behavior elsewhere in this codebase
 * (`SimpleGitClient.readFile`, `modules/conventions/samples.ts`) joins a
 * caller-supplied relative path onto the clone directory with NO containment
 * check — this module does not fix those (other callers, out of scope for
 * this feature; see plans/09-project-context-folder.md planner finding 2),
 * it establishes containment for itself, as the spec requires.
 *
 * Pure string/fs logic only — no DB, no module state — unit-testable with a
 * plain tmpdir fixture.
 */

/** Thrown when a path escapes the checkout, syntactically or via a symlink
 *  (AC-27). Never carries the raw filesystem error — callers map this to the
 *  `refused_containment` reason, distinct from "the file doesn't exist". */
export class ContainmentError extends Error {
  constructor(public readonly path: string) {
    super(`Path escapes the repository checkout: ${path}`);
    this.name = 'ContainmentError';
  }
}

/** Thrown when the resolved path (or one of its ancestors) doesn't exist.
 *  Callers map this to the `missing` reason (AC-36) — distinct from a
 *  containment refusal. */
export class MissingPathError extends Error {
  constructor(public readonly path: string) {
    super(`Path does not exist: ${path}`);
    this.name = 'MissingPathError';
  }
}

/**
 * True iff `rel` is a syntactically safe repository-relative path: not
 * absolute, and no `..` segment anywhere. Used both to validate a repo's
 * configured search roots (AC-27's "search-root config must not be able to
 * select paths outside the checkout") and as the first gate before any read.
 *
 * Deliberately conservative: this does not (and cannot, without touching the
 * filesystem) catch a symlink escape — that's `resolveContainedPath` below.
 */
export function isRelativeSafePath(rel: string): boolean {
  if (typeof rel !== 'string' || rel.length === 0) return false;
  if (isAbsolute(rel)) return false;
  // Reject a leading "~" (shell/tool home-dir expansion some callers might
  // apply) and any backslash (Windows-style absolute/traversal on a
  // cross-platform server) defensively, even though this server only runs
  // clones with forward-slash relative paths.
  if (rel.startsWith('~') || rel.includes('\\')) return false;
  const segments = rel.split('/');
  return segments.every((s) => s !== '..' && s !== '');
}

function withTrailingSep(p: string): string {
  return p.endsWith(sep) ? p : p + sep;
}

/** Syntactic containment: `resolve(root, rel)` must equal `root` or start
 *  with `root + sep`. Does not touch the filesystem. */
function assertSyntacticallyContained(root: string, rel: string): string {
  if (!isRelativeSafePath(rel)) throw new ContainmentError(rel);
  const joined = resolve(root, rel);
  if (joined !== root && !joined.startsWith(withTrailingSep(root))) {
    throw new ContainmentError(rel);
  }
  return joined;
}

/**
 * Resolve `rel` against `cloneRoot`, proving containment even against a
 * symlink planted between attachment time and run time:
 *
 *  1. Reject `..` / absolute / other unsafe shapes (syntactic).
 *  2. `resolve()` must land inside `cloneRoot` (syntactic).
 *  3. `realpath` BOTH `cloneRoot` and the resolved path, then re-check
 *     containment on the REAL paths — this is what catches a symlink whose
 *     target escapes the checkout, which step 2 alone cannot see.
 *
 * Throws `ContainmentError` for any escape (syntactic or via symlink), or
 * `MissingPathError` when the path (or an ancestor directory) doesn't exist —
 * callers must distinguish the two (AC-27 vs AC-36 are different reasons).
 * Any other `realpath` failure (e.g. permissions) is rethrown as-is; the
 * caller maps it to `unreadable`.
 */
export async function resolveContainedPath(cloneRoot: string, rel: string): Promise<string> {
  const joined = assertSyntacticallyContained(cloneRoot, rel);

  let realRoot: string;
  let realTarget: string;
  try {
    [realRoot, realTarget] = await Promise.all([realpath(cloneRoot), realpath(joined)]);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new MissingPathError(rel);
    throw err;
  }

  if (realTarget !== realRoot && !realTarget.startsWith(withTrailingSep(realRoot))) {
    throw new ContainmentError(rel);
  }
  return realTarget;
}
