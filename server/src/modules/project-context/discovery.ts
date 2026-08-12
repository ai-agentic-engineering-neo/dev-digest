import { readdir, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { DOC_EXTENSION, MAX_DISCOVERED_DOCS, MAX_DOC_BYTES, docTypeLabel } from './constants.js';
import { isRelativeSafePath } from './paths.js';

/**
 * specs/09-project-context-folder.md — discovery.
 *
 * Walk a repo's synced checkout under its configured search roots for `.md`
 * files. Modeled on `modules/repo-intel/pipeline/walk.ts`: never follow
 * symlinks, skip unreadable directories cleanly, stat-gate on size, stable
 * alphabetical order, bound the combined result. Regular files only (AC-28).
 */

export interface DiscoveredDoc {
  /** Repository-relative, forward-slash path. */
  path: string;
  /** The configured root (as written in config) that matched this path —
   *  first-matching-root wins when roots nest, so the label stays
   *  deterministic (Q4). */
  matchedRoot: string;
}

export interface DiscoveryStats {
  /** `.md` regular files seen, before the size + bound filters. */
  totalCandidates: number;
  /** Candidates dropped because they exceeded MAX_DOC_BYTES (AC-28). */
  skippedTooLarge: number;
  /** Candidates dropped because the combined result exceeded
   *  MAX_DISCOVERED_DOCS. */
  bounded: number;
}

export interface DiscoveryResult {
  documents: DiscoveredDoc[];
  stats: DiscoveryStats;
}

/**
 * Scan `cloneRoot` under each of `roots` (repository-relative directories,
 * in configured order) for `.md` files. A root that doesn't exist (e.g. a
 * repo with no `docs/` folder) is skipped cleanly, not an error (AC-20).
 */
export async function discoverDocuments(
  cloneRoot: string,
  roots: readonly string[],
): Promise<DiscoveryResult> {
  const stats: DiscoveryStats = { totalCandidates: 0, skippedTooLarge: 0, bounded: 0 };
  const seen = new Set<string>();
  const out: DiscoveredDoc[] = [];

  for (const root of roots) {
    // Defensive: roots are validated (relative, `..`-free) before they're
    // persisted (`service.setDocRoots`), but re-check here too — a corrupt/
    // hand-edited DB row must never reach a filesystem walk unvalidated.
    if (!isRelativeSafePath(root)) continue;
    const rootAbs = resolve(cloneRoot, root);
    if (rootAbs !== cloneRoot && !rootAbs.startsWith(cloneRoot + sep)) continue;

    const files = await walkMarkdown(cloneRoot, rootAbs, stats);
    for (const rel of files) {
      if (seen.has(rel)) continue; // first-matching-root wins (AC-11-style earliest-wins, applied to roots)
      seen.add(rel);
      out.push({ path: rel, matchedRoot: root });
    }
  }

  out.sort((a, b) => a.path.localeCompare(b.path));
  if (out.length > MAX_DISCOVERED_DOCS) {
    stats.bounded = out.length - MAX_DISCOVERED_DOCS;
    out.length = MAX_DISCOVERED_DOCS;
  }

  return { documents: out, stats };
}

/** The doc-type label for a discovered document (Q4). */
export function labelFor(doc: DiscoveredDoc): string {
  return docTypeLabel(doc.matchedRoot);
}

async function walkMarkdown(
  cloneRoot: string,
  dir: string,
  stats: DiscoveryStats,
): Promise<string[]> {
  const out: string[] = [];
  let entries: Dirent[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
  } catch {
    // Root doesn't exist, or an unreadable directory (permissions, dangling
    // symlink) — skip cleanly so discovery keeps making progress on the
    // parts of the checkout it CAN read (matches walkClone's contract).
    return out;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue; // never follow symlinks (loops, escapes)
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      out.push(...(await walkMarkdown(cloneRoot, full, stats)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(DOC_EXTENSION)) continue;

    stats.totalCandidates += 1;

    let size: number;
    try {
      size = (await stat(full)).size;
    } catch {
      continue;
    }
    if (size > MAX_DOC_BYTES) {
      stats.skippedTooLarge += 1;
      continue;
    }

    out.push(relative(cloneRoot, full).split(sep).join('/'));
  }

  return out;
}
