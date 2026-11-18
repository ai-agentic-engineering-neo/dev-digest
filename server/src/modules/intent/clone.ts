import { readContainedFile } from '../_shared/checkout-paths.js';

/** Same 2-line pattern `conventions/samples.ts`'s `readClone` keeps private —
 *  duplicated here rather than exported across a module boundary for one
 *  helper (see that file's own comment for the precedent). */
export async function readClone(clonePath: string, file: string): Promise<string | null> {
  // S6 — containment-checked: a committed symlink can't read outside the clone.
  return readContainedFile(clonePath, file);
}
