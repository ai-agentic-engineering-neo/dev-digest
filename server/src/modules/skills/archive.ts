import { inflateRawSync } from 'node:zlib';
import { MAX_ARCHIVE_ENTRIES, MAX_ENTRY_BYTES } from './constants.js';

/**
 * Minimal, read-only ZIP reader — central directory + per-entry inflate.
 *
 * Why hand-rolled: the import path needs to LIST an archive and unpack a couple
 * of markdown files, never to restore a tree. A general unzip library would add
 * a dependency whose whole surface (symlinks, permissions, writing to disk) is
 * exactly what this feature must not do. Everything here is in-memory and pure:
 * a Buffer in, entry metadata and decoded text out, no filesystem at all.
 *
 * Unsupported on purpose: ZIP64, encryption, and any compression method other
 * than store (0) / deflate (8). Each is reported as a clear error rather than
 * producing a partially-read archive.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
/** The EOCD comment is a uint16, so the record starts within the last 64 KiB + 22. */
const EOCD_MAX_SCAN = 0xffff + EOCD_MIN_SIZE;

export interface ZipEntry {
  /** Normalized, forward-slash path as stored in the archive. */
  path: string;
  /** Uncompressed size in bytes, as recorded in the central directory. */
  size: number;
  compressedSize: number;
  /** 0 = stored, 8 = deflate. */
  method: number;
  localHeaderOffset: number;
  /** A directory entry ("a/b/") carries no data. */
  directory: boolean;
}

export class ArchiveError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ArchiveError';
  }
}

/** True when the buffer starts with a local-file-header or empty-archive signature. */
export function looksLikeZip(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  const sig = buf.readUInt32LE(0);
  return sig === LOCAL_SIGNATURE || sig === CENTRAL_SIGNATURE || sig === EOCD_SIGNATURE;
}

function findEocd(buf: Buffer): number {
  const start = Math.max(0, buf.length - EOCD_MAX_SCAN);
  for (let i = buf.length - EOCD_MIN_SIZE; i >= start; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  throw new ArchiveError('Not a ZIP archive (no end-of-central-directory record).');
}

/**
 * Reject anything that would escape the archive root. We never write these
 * paths to disk, but a "../../etc/passwd" entry is a signal about the archive,
 * not a quirk to normalise away.
 */
function safePath(raw: string): string {
  const path = raw.replace(/\\/g, '/');
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) {
    throw new ArchiveError(`Absolute path in archive: ${raw}`);
  }
  if (path.split('/').includes('..')) {
    throw new ArchiveError(`Path traversal in archive: ${raw}`);
  }
  return path;
}

/** List every entry from the central directory. Nothing is decompressed here. */
export function listZipEntries(buf: Buffer): ZipEntry[] {
  const eocd = findEocd(buf);
  const total = buf.readUInt16LE(eocd + 10);
  const centralOffset = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || centralOffset === 0xffffffff) {
    throw new ArchiveError('ZIP64 archives are not supported.');
  }
  if (total > MAX_ARCHIVE_ENTRIES) {
    throw new ArchiveError(`Archive has ${total} entries (limit ${MAX_ARCHIVE_ENTRIES}).`);
  }

  const entries: ZipEntry[] = [];
  let p = centralOffset;
  for (let i = 0; i < total; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL_SIGNATURE) {
      throw new ArchiveError('Corrupt central directory.');
    }
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const path = safePath(name);
    entries.push({
      path,
      size,
      compressedSize,
      method,
      localHeaderOffset,
      directory: path.endsWith('/'),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Decompress ONE entry and return it as UTF-8 text. */
export function readZipEntryText(buf: Buffer, entry: ZipEntry): string {
  if (entry.directory) throw new ArchiveError(`${entry.path} is a directory entry.`);
  if (entry.size > MAX_ENTRY_BYTES) {
    throw new ArchiveError(`${entry.path} is ${entry.size} bytes (limit ${MAX_ENTRY_BYTES}).`);
  }
  const h = entry.localHeaderOffset;
  if (h + 30 > buf.length || buf.readUInt32LE(h) !== LOCAL_SIGNATURE) {
    throw new ArchiveError(`Corrupt local header for ${entry.path}.`);
  }
  // The local header repeats the name/extra lengths and they may DIFFER from
  // the central directory's (extra fields are written per-header), so the data
  // offset has to come from here, not from the entry we listed.
  const nameLen = buf.readUInt16LE(h + 26);
  const extraLen = buf.readUInt16LE(h + 28);
  const start = h + 30 + nameLen + extraLen;
  // Both sizes in the header are attacker-controlled uint32s. A short lie makes
  // `subarray` clamp and return a SILENTLY truncated skill; a long one walks
  // past the size gate above, which only saw the declared `size`. Bound the
  // read against the real buffer and re-check the real length.
  if (start + entry.compressedSize > buf.length) {
    throw new ArchiveError(`${entry.path} declares more data than the archive holds.`);
  }
  const data = buf.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) {
    if (data.length > MAX_ENTRY_BYTES) {
      throw new ArchiveError(`${entry.path} is ${data.length} bytes (limit ${MAX_ENTRY_BYTES}).`);
    }
    return data.toString('utf8');
  }
  if (entry.method === 8) {
    try {
      // maxOutputLength is the real cap for the deflate path — the declared
      // size is not trusted here either.
      return inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES }).toString('utf8');
    } catch (err) {
      // zlib distinguishes "hit the cap" (ERR_BUFFER_TOO_LARGE) from corrupt
      // bytes by code; keep the original as the cause instead of flattening it.
      const msg = err instanceof Error ? err.message : String(err);
      throw new ArchiveError(`Could not inflate ${entry.path}: ${msg}`, { cause: err });
    }
  }
  throw new ArchiveError(`Unsupported compression method ${entry.method} for ${entry.path}.`);
}
