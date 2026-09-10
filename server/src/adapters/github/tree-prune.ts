/**
 * Which blobs a `commitFiles` call must DELETE.
 *
 * A commit built with `base_tree` is purely additive: it adds and overwrites,
 * never removes. That is correct for a repository DevDigest only contributes
 * to, and wrong for the directory it owns outright — when a generated file's
 * path changes between exports (a renamed agent manifest, a renumbered ncc
 * chunk), the old path survives on the branch forever. For agent manifests
 * that is not cosmetic: the runner treats every `.devdigest/agents/*.yaml` it
 * finds as an installed reviewer, so the orphan silently re-runs an agent
 * whose real manifest was renamed.
 *
 * Pure and separately tested because the surrounding `commitFiles` is a
 * network-bound octokit call: this is the part with a decision in it.
 */

/** Is `path` inside a directory the commit owns? Matched on whole path
 *  segments — a bare `startsWith` would let `.devdigest-backup/x` be pruned
 *  by an owner of `.devdigest`. */
export function isOwnedBy(path: string, dir: string): boolean {
  return path === dir || path.startsWith(`${dir}/`);
}

/**
 * Paths present on the branch, inside an owned directory, that this commit is
 * not writing — i.e. everything left over from an earlier export.
 *
 * Deliberately NOT a symmetric difference: a file outside every owned
 * directory is never returned, whatever it is. DevDigest deletes only from
 * the space it generates.
 */
export function stalePathsToPrune(
  existingPaths: readonly string[],
  writtenPaths: readonly string[],
  pruneDirs: readonly string[],
): string[] {
  if (pruneDirs.length === 0) return [];
  const written = new Set(writtenPaths);
  return existingPaths.filter(
    (path) => !written.has(path) && pruneDirs.some((dir) => isOwnedBy(path, dir)),
  );
}
