import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { EXCLUDED_DIRS, EXCLUDED_FILE_NAMES, MAX_CONTEXT_DOCS } from './constants.js';
import { globToRegExp } from '../../platform/project-context.js';

/**
 * Filesystem side of Project Context: walks a repo clone for markdown
 * documents and reads one safely. Read-only — nothing here ever writes into the
 * clone (a resync `git reset --hard` would wipe it anyway).
 */

export interface DiscoveredFile {
  /** Repo-relative POSIX path. */
  path: string;
  sizeBytes: number;
  mtimeMs: number;
}

/** True when `target` is `root` itself or sits inside it. */
function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && !/^[A-Za-z]:/.test(rel));
}

const toPosix = (p: string) => p.split(sep).join('/');

/**
 * Walk each root under `cloneDir` and collect every regular `.md` file whose
 * root-relative path matches `glob`. Skips `node_modules`, `.git`, `vendor`,
 * README files and every symlink (a link could point outside the repo). Stops at
 * MAX_CONTEXT_DOCS and reports `truncated`.
 */
export async function discoverMarkdown(
  cloneDir: string,
  roots: readonly string[],
  glob: string,
): Promise<{ files: DiscoveredFile[]; truncated: boolean }> {
  const matcher = globToRegExp(glob);
  const seen = new Map<string, DiscoveredFile>();
  let truncated = false;

  for (const root of roots) {
    const rootAbs = resolve(cloneDir, root);
    if (!isInside(cloneDir, rootAbs)) continue;

    const stack: string[] = [rootAbs];
    while (stack.length > 0 && !truncated) {
      const dir = stack.pop()!;
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      // Sorted so discovery (and therefore the list) is deterministic.
      entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      for (const e of entries) {
        if (e.isSymbolicLink()) continue;
        const abs = join(dir, e.name);
        if (e.isDirectory()) {
          if (!EXCLUDED_DIRS.has(e.name)) stack.push(abs);
          continue;
        }
        if (!e.isFile() || !e.name.toLowerCase().endsWith('.md')) continue;
        if (EXCLUDED_FILE_NAMES.has(e.name.toLowerCase())) continue;
        if (!matcher.test(toPosix(relative(rootAbs, abs)))) continue;
        const repoPath = toPosix(relative(cloneDir, abs));
        if (seen.has(repoPath)) continue;
        if (seen.size >= MAX_CONTEXT_DOCS) {
          truncated = true;
          break;
        }
        const st = await stat(abs);
        seen.set(repoPath, { path: repoPath, sizeBytes: st.size, mtimeMs: st.mtimeMs });
      }
    }
  }

  const files = [...seen.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, truncated };
}

/**
 * Read a repo-relative file from the clone's working tree, refusing anything
 * that resolves outside the clone (including through a symlink).
 */
export async function readInsideClone(cloneDir: string, repoPath: string): Promise<string> {
  const abs = resolve(cloneDir, repoPath);
  const real = await realpath(abs);
  const realRoot = await realpath(cloneDir);
  if (!isInside(realRoot, real)) throw new Error(`path escapes the repository: ${repoPath}`);
  return readFile(real, 'utf8');
}
