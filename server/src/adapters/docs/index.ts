/**
 * docs adapter — lists markdown files of a local clone for the Project Context Folder (SPEC-01).
 *
 * Never follows symlinks, skips `node_modules/ vendor/ .git/ clones/` at any depth and unreadable
 * directories, keeps `*.md` (case-insensitive). Returns POSIX paths relative to `root`, sorted,
 * at most MAX_DOC_FILES. Which of them are "docs" is decided by the context module
 * (`classifyDocPath`); this adapter must not import `modules/**`, so its bounds are local.
 */
import { readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, relative, sep } from 'node:path';

const EXCLUDED_DIRS = new Set(['node_modules', 'vendor', '.git', 'clones']);
const MAX_DOC_FILES = 2000;

export interface DocWalker {
  listMarkdown(root: string): Promise<string[]>;
}

export class FsDocWalker implements DocWalker {
  async listMarkdown(root: string): Promise<string[]> {
    const out: string[] = [];
    await walk(root, root, out);
    out.sort();
    return out.slice(0, MAX_DOC_FILES);
  }
}

async function walk(root: string, dir: string, out: string[]): Promise<void> {
  let entries: Dirent[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
  } catch {
    return; // missing root / unreadable dir → skip
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      await walk(root, full, out);
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;
    out.push(relative(root, full).split(sep).join('/'));
  }
}
