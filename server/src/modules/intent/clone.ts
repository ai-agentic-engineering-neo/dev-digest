import { readFile } from 'node:fs/promises';
import { ContainmentError, MissingPathError, resolveContainedPath } from '../_shared/checkout-paths.js';

/**
 * Reads one file off a repo's checkout, containment-checked via
 * `resolveContainedPath` — the same posture `brief/clone.ts` already takes.
 *
 * This used to be a bare `join(clonePath, file)`, which was safe only because
 * the old `parseSpecRef` regex structurally could not produce `..` or an
 * absolute path: the regex was doubling as the validator. Spec discovery is
 * now permissive by design and draws candidates from the PR description —
 * attacker-influenceable text — so that implicit guarantee is gone and the
 * check has to be explicit here.
 *
 * Never throws: a containment refusal or any read failure resolves to `null`,
 * matching the offline-degrades posture of the rest of the intent read path.
 */
export async function readClone(clonePath: string, file: string): Promise<string | null> {
  try {
    const real = await resolveContainedPath(clonePath, file);
    return await readFile(real, 'utf8');
  } catch (err) {
    if (err instanceof ContainmentError || err instanceof MissingPathError) return null;
    return null;
  }
}
