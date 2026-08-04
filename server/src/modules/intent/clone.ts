import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Same 2-line pattern `conventions/samples.ts`'s `readClone` keeps private —
 *  duplicated here rather than exported across a module boundary for one
 *  helper (see that file's own comment for the precedent). */
export async function readClone(clonePath: string, file: string): Promise<string | null> {
  return readFile(join(clonePath, file), 'utf8').catch(() => null);
}
