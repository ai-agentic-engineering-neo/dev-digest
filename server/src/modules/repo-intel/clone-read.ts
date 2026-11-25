import { readContainedFile } from '../../platform/contained-read.js';

/** Read a repo-relative file from the clone; `null` when missing/unreadable. */
export async function readClone(clonePath: string, file: string): Promise<string | null> {
  // S6 — containment-checked: a committed symlink can't read outside the clone.
  return readContainedFile(clonePath, file);
}
