import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';

/** Upper bound for a single file read off a checkout (sources, configs, docs). */
export const MAX_CHECKOUT_FILE_BYTES = 2 * 1024 * 1024;

/**
 * Read a repository-relative file from a clone, or `null` when it can't be
 * read safely. A cloned repo is untrusted input — it can commit a symlink such
 * as `src/config.ts -> ../../../.env` that a plain `readFile(join(clone, rel))`
 * follows straight out of the checkout and into prompts, traces and the index.
 * Here the path must resolve (after symlinks) inside the clone, be a regular
 * file, and be at most `maxBytes`.
 *
 * Returns `null` for every refusal (escape, missing, directory, too big,
 * unreadable) — callers treat "no content" as "skip this file".
 */
export async function readContainedFile(
  cloneRoot: string,
  rel: string,
  opts: { maxBytes?: number } = {},
): Promise<string | null> {
  const maxBytes = opts.maxBytes ?? MAX_CHECKOUT_FILE_BYTES;
  if (!rel || isAbsolute(rel) || rel.includes('\0')) return null;
  try {
    const realRoot = await realpath(cloneRoot);
    const real = await realpath(resolve(realRoot, rel));
    if (real === realRoot || !real.startsWith(realRoot.endsWith(sep) ? realRoot : realRoot + sep)) {
      return null;
    }
    const info = await stat(real);
    if (!info.isFile() || info.size > maxBytes) return null;
    return await readFile(real, 'utf8');
  } catch {
    return null;
  }
}
