import { readFile, stat } from 'node:fs/promises';
import { ContainmentError, MissingPathError, resolveContainedPath } from '../_shared/checkout-paths.js';
import { MAX_SPEC_BYTES } from './constants.js';

/**
 * Reads the referenced spec document off a repo's checkout, containment-
 * checked via `resolveContainedPath` — finding 5 (plans/11-why-risk-brief.md):
 * `parseSpecRef`'s regex cannot itself produce `..`/an absolute path, so this
 * is defense in depth, matching SPEC-09/SPEC-10's precedent rather than
 * `intent/clone.ts`'s bare `join(clonePath, file)`.
 *
 * Never throws — a containment refusal, a missing file, an oversized file or
 * any other read failure all resolve to `null` (AC-7: "unreadable" degrades
 * to "unavailable", never a failure).
 */
export async function readSpecFile(clonePath: string, path: string): Promise<string | null> {
  try {
    const real = await resolveContainedPath(clonePath, path);
    const st = await stat(real);
    if (!st.isFile() || st.size > MAX_SPEC_BYTES) return null;
    return await readFile(real, 'utf8');
  } catch (err) {
    if (err instanceof ContainmentError || err instanceof MissingPathError) return null;
    return null;
  }
}
