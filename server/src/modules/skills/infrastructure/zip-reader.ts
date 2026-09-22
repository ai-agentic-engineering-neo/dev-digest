/**
 * `.zip` reader over fflate (pure JS). Entries are addressed by NAME from the
 * central directory: nothing is extracted to disk, nothing is executed, and
 * only the one requested entry is ever inflated (path traversal can't apply).
 */
import { unzipSync } from 'fflate';
import type { ArchiveReader } from '../application/ports.js';
import type { ArchiveEntry } from '../domain/import.js';

export const fflateArchiveReader: ArchiveReader = {
  list(bytes: Uint8Array): ArchiveEntry[] {
    const entries: ArchiveEntry[] = [];
    // The filter sees every entry's directory record; returning false skips inflating it.
    unzipSync(bytes, {
      filter: (file) => {
        entries.push({ path: file.name, size: file.originalSize });
        return false;
      },
    });
    return entries;
  },

  readText(bytes: Uint8Array, path: string, maxBytes: number): string {
    let tooLarge = false;
    const files = unzipSync(bytes, {
      filter: (file) => {
        if (file.name !== path) return false;
        // fflate inflates into a buffer of the DECLARED size: refuse before
        // inflating, and check the real length again after.
        tooLarge = file.originalSize > maxBytes;
        return !tooLarge;
      },
    });
    if (tooLarge) throw new Error(`entry is larger than ${maxBytes} bytes`);
    const data = files[path];
    if (!data) throw new Error('entry not found');
    if (data.length > maxBytes) throw new Error(`entry is larger than ${maxBytes} bytes`);
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  },
};
