/**
 * archive adapter — a minimal, read-only ZIP reader for skill import (L02).
 *
 * Deliberately tiny and dependency-free (node:zlib only):
 *  - lists entries from the central directory WITHOUT decompressing anything;
 *  - decompresses a single entry on demand, capped by `maxOutputLength`, so a
 *    zip bomb cannot inflate past the per-entry limit;
 *  - never writes to disk and never executes anything — callers decide which
 *    entry (if any) to read; everything else stays compressed bytes.
 *
 * Unsupported on purpose: ZIP64, encryption, compression other than
 * stored/deflate, multi-disk archives. Those are rejected with ArchiveError.
 */
import { inflateRawSync } from 'node:zlib';

export class ArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveError';
  }
}

export interface ArchiveLimits {
  /** Max number of entries in the central directory. */
  maxEntries: number;
  /** Max sum of declared uncompressed sizes. */
  maxTotalBytes: number;
  /** Max uncompressed size of any single entry that is read. */
  maxEntryBytes: number;
}

export interface ArchiveEntry {
  /** Normalized forward-slash path, no leading `./` or `/`. */
  path: string;
  isDirectory: boolean;
  /** Declared uncompressed size. */
  size: number;
  /** Decompress this entry (bounded by `maxEntryBytes`). */
  read(): Uint8Array;
}

const EOCD_SIG = 0x06054b50;
const CDH_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;
const EOCD_MIN = 22;
const MAX_COMMENT = 0xffff;

export class ZipArchiveReader {
  list(data: Uint8Array, limits: ArchiveLimits): ArchiveEntry[] {
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const eocd = findEocd(buf);
    const count = buf.readUInt16LE(eocd + 10);
    const cdSize = buf.readUInt32LE(eocd + 12);
    const cdOffset = buf.readUInt32LE(eocd + 16);
    if (count === 0xffff || cdOffset === 0xffffffff) throw new ArchiveError('ZIP64 archives are not supported');
    if (count > limits.maxEntries) throw new ArchiveError(`Archive has ${count} entries (max ${limits.maxEntries})`);
    if (cdOffset + cdSize > buf.length) throw new ArchiveError('Corrupt archive: central directory out of range');

    const entries: ArchiveEntry[] = [];
    let total = 0;
    let p = cdOffset;
    for (let i = 0; i < count; i++) {
      if (p + 46 > buf.length || buf.readUInt32LE(p) !== CDH_SIG) {
        throw new ArchiveError('Corrupt archive: bad central directory header');
      }
      const flags = buf.readUInt16LE(p + 8);
      const method = buf.readUInt16LE(p + 10);
      const compSize = buf.readUInt32LE(p + 20);
      const size = buf.readUInt32LE(p + 24);
      const nameLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commentLen = buf.readUInt16LE(p + 32);
      const localOffset = buf.readUInt32LE(p + 42);
      const rawName = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
      p += 46 + nameLen + extraLen + commentLen;

      if (size === 0xffffffff || compSize === 0xffffffff) throw new ArchiveError('ZIP64 entries are not supported');
      total += size;
      if (total > limits.maxTotalBytes) {
        throw new ArchiveError(`Archive expands to more than ${limits.maxTotalBytes} bytes`);
      }

      const path = normalizePath(rawName);
      if (!path) continue;
      const isDirectory = rawName.endsWith('/');
      entries.push({
        path,
        isDirectory,
        size,
        read: () => readEntry(buf, { path, flags, method, compSize, size, localOffset }, limits.maxEntryBytes),
      });
    }
    return entries;
  }
}

function findEocd(buf: Buffer): number {
  const stop = Math.max(0, buf.length - EOCD_MIN - MAX_COMMENT);
  for (let i = buf.length - EOCD_MIN; i >= stop; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new ArchiveError('Not a ZIP archive');
}

/** Forward slashes, no leading `/` or `./`, no `..` segments (dropped → ''). */
function normalizePath(raw: string): string {
  const parts = raw.replace(/\\/g, '/').split('/').filter((s) => s !== '' && s !== '.');
  if (parts.some((s) => s === '..')) return '';
  return parts.join('/');
}

function readEntry(
  buf: Buffer,
  e: { path: string; flags: number; method: number; compSize: number; size: number; localOffset: number },
  maxEntryBytes: number,
): Uint8Array {
  if (e.flags & 0x1) throw new ArchiveError(`Encrypted entry: ${e.path}`);
  if (e.size > maxEntryBytes) throw new ArchiveError(`${e.path} is larger than ${maxEntryBytes} bytes`);
  const lh = e.localOffset;
  if (lh + 30 > buf.length || buf.readUInt32LE(lh) !== LFH_SIG) {
    throw new ArchiveError(`Corrupt archive: bad local header for ${e.path}`);
  }
  const start = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
  const end = start + e.compSize;
  if (end > buf.length) throw new ArchiveError(`Corrupt archive: ${e.path} out of range`);
  const raw = buf.subarray(start, end);
  if (e.method === 0) return new Uint8Array(raw);
  if (e.method === 8) {
    try {
      return new Uint8Array(inflateRawSync(raw, { maxOutputLength: maxEntryBytes }));
    } catch {
      throw new ArchiveError(`Cannot decompress ${e.path} (corrupt or larger than ${maxEntryBytes} bytes)`);
    }
  }
  throw new ArchiveError(`Unsupported compression method ${e.method} for ${e.path}`);
}
