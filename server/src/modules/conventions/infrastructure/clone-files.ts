/**
 * Read-only access to a repo clone (implements CloneFiles). Every read is
 * confined to the clone: the path is checked lexically AND after realpath, so a
 * symlink inside the repo cannot point the evidence gate at a file outside it.
 */
import type { Dirent } from 'node:fs';
import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { CloneFiles } from '../application/ports.js';
import { FILE_READ_MAX_BYTES, SKIP_DIRS, WALK_MAX_DEPTH, WALK_MAX_FILES } from '../domain/constants.js';
import { safeRelativePath } from '../domain/evidence.js';

const SKIP = new Set<string>(SKIP_DIRS);

function inside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== '' && !rel.startsWith('..') && !rel.startsWith(sep) && !rel.includes(`..${sep}`);
}

export const cloneFiles: CloneFiles = {
  async list(root) {
    const out: string[] = [];
    // Breadth-first so a deep tree cannot starve the root-level files.
    let level: string[] = [''];
    for (let depth = 0; depth <= WALK_MAX_DEPTH && level.length > 0 && out.length < WALK_MAX_FILES; depth++) {
      const next: string[] = [];
      for (const dir of level) {
        let entries: Dirent[];
        try {
          entries = await readdir(join(root, dir), { withFileTypes: true });
        } catch {
          continue;
        }
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const e of entries) {
          const rel = dir ? `${dir}/${e.name}` : e.name;
          // Symlinks are never followed by the walk (isFile/isDirectory are false for them).
          if (e.isDirectory()) {
            if (!SKIP.has(e.name) && !e.name.startsWith('.')) next.push(rel);
          } else if (e.isFile()) {
            out.push(rel);
            if (out.length >= WALK_MAX_FILES) break;
          }
        }
        if (out.length >= WALK_MAX_FILES) break;
      }
      level = next;
    }
    return out;
  },

  async read(root, path) {
    const safe = safeRelativePath(path);
    if (!safe) return null;
    try {
      const realRoot = await realpath(root);
      const target = join(realRoot, safe);
      if (!inside(realRoot, target)) return null;
      const resolved = await realpath(target);
      if (!inside(realRoot, resolved)) return null;
      const info = await stat(resolved);
      if (!info.isFile() || info.size > FILE_READ_MAX_BYTES) return null;
      // lstat of the lexical path: refuse a symlinked leaf even when it stays inside.
      if ((await lstat(target)).isSymbolicLink()) return null;
      const text = await readFile(resolved, 'utf8');
      return text.includes('\0') ? null : text;
    } catch {
      return null;
    }
  },
};
