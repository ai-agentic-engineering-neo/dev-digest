/**
 * archive adapter — read-only, in-memory access to an uploaded .zip (M2 skill
 * import). Wraps `fflate` so services never touch the library directly.
 *
 * Safety contract (an imported archive is attacker-controlled):
 *  - nothing is ever written to disk and nothing is ever executed;
 *  - only entries the CALLER selects are decompressed — everything else is just
 *    listed by name (so the UI can show "skipped: scripts/evil.sh");
 *  - unsafe names (absolute, `..`, backslashes, NUL) are never decompressed;
 *  - limits on entry count, per-file size and compression ratio (zip bombs).
 */
import { unzipSync, strFromU8 } from 'fflate';

export interface ArchiveLimits {
  /** Max entries in the archive (dirs included). */
  maxEntries: number;
  /** Max decompressed size of a single selected file, bytes. */
  maxFileBytes: number;
  /** Max decompressed/compressed ratio for a selected file. */
  maxRatio: number;
}

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = {
  maxEntries: 200,
  maxFileBytes: 256 * 1024,
  maxRatio: 100,
};

export interface ArchiveListing {
  /** Every entry name in the archive (as stored), directories excluded. */
  entries: string[];
  /** Decompressed UTF-8 text of the selected entries, keyed by name. */
  texts: Record<string, string>;
  /** Entries that were selected but refused (unsafe name / limits). */
  rejected: { name: string; reason: string }[];
}

export interface ArchiveReader {
  /**
   * List a zip and decompress ONLY the entries for which `select(name)` is true.
   * Throws `ArchiveError` for a corrupt archive or too many entries.
   */
  readZip(data: Uint8Array, select: (name: string) => boolean, limits?: ArchiveLimits): ArchiveListing;
}

export class ArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveError';
  }
}

/** True for names that could escape an extraction root or confuse path logic. */
export function isUnsafeEntryName(name: string): boolean {
  if (name.length === 0 || name.includes('\0') || name.includes('\\')) return true;
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return true;
  return name.split('/').some((seg) => seg === '..');
}

export class FflateArchiveReader implements ArchiveReader {
  readZip(
    data: Uint8Array,
    select: (name: string) => boolean,
    limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
  ): ArchiveListing {
    const entries: string[] = [];
    const rejected: { name: string; reason: string }[] = [];
    let seen = 0;
    let out: Record<string, Uint8Array>;
    try {
      out = unzipSync(data, {
        // fflate calls filter for every entry BEFORE inflating it — the only
        // decision point, so all checks live here.
        filter: (file) => {
          seen += 1;
          if (seen > limits.maxEntries) {
            throw new ArchiveError(`Archive has more than ${limits.maxEntries} entries`);
          }
          if (file.name.endsWith('/')) return false;
          entries.push(file.name);
          if (!select(file.name)) return false;
          if (isUnsafeEntryName(file.name)) {
            rejected.push({ name: file.name, reason: 'unsafe path' });
            return false;
          }
          if (file.originalSize > limits.maxFileBytes) {
            rejected.push({ name: file.name, reason: 'file too large' });
            return false;
          }
          if (file.size > 0 && file.originalSize / file.size > limits.maxRatio) {
            rejected.push({ name: file.name, reason: 'suspicious compression ratio' });
            return false;
          }
          return true;
        },
      });
    } catch (err) {
      if (err instanceof ArchiveError) throw err;
      throw new ArchiveError('Not a valid .zip archive');
    }
    const texts: Record<string, string> = {};
    for (const [name, bytes] of Object.entries(out)) {
      // Declared sizes can lie — re-check what was actually produced.
      if (bytes.length > limits.maxFileBytes) {
        rejected.push({ name, reason: 'file too large' });
        continue;
      }
      texts[name] = strFromU8(bytes);
    }
    return { entries, texts, rejected };
  }
}
