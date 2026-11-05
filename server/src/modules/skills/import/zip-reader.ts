import { inflateRawSync } from 'node:zlib';
import { ValidationError } from '../../../platform/errors.js';

/**
 * Minimal, defensive in-memory ZIP reader for skill imports. Nothing is ever
 * written to disk or executed: entries are listed from the central directory
 * and only the ones the caller asks for are inflated, each with a hard output
 * cap (zip-bomb guard). Supports stored (0) and deflate (8); ZIP64, encrypted
 * and other methods are reported as unreadable instead of being trusted.
 */

const EOCD_SIG = 0x06054b50;
const CDH_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;
const EOCD_MIN = 22;
const EOCD_MAX_SCAN = EOCD_MIN + 0xffff;

export interface ZipEntry {
  /** Raw entry name as stored in the archive. */
  name: string;
  isDirectory: boolean;
  /** Declared uncompressed size. */
  size: number;
  /** Unix mode bits when the archive was made on unix (0 otherwise). */
  unixMode: number;
  /** Why the entry can't be read (encrypted, zip64, unsupported method) — null when readable. */
  unreadable: string | null;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

export interface ZipLimits {
  maxEntries: number;
  maxEntryBytes: number;
}

export function isZip(buf: Buffer): boolean {
  return buf.length >= 4 && buf.readUInt32LE(0) === LFH_SIG;
}

function findEocd(buf: Buffer): number {
  const stop = Math.max(0, buf.length - EOCD_MAX_SCAN);
  for (let i = buf.length - EOCD_MIN; i >= stop; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new ValidationError('Not a valid ZIP archive (end of central directory not found)');
}

export function listZipEntries(buf: Buffer, limits: ZipLimits): ZipEntry[] {
  const eocd = findEocd(buf);
  const total = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (total > limits.maxEntries) {
    throw new ValidationError(`Archive has ${total} entries (limit ${limits.maxEntries})`);
  }
  if (cdOffset === 0xffffffff || total === 0xffff) {
    throw new ValidationError('ZIP64 archives are not supported');
  }

  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < total; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CDH_SIG) {
      throw new ValidationError('Corrupt ZIP central directory');
    }
    const versionMadeBy = buf.readUInt16LE(p + 4);
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const externalAttrs = buf.readUInt32LE(p + 38);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    // Windows tools (PowerShell 5.1 Compress-Archive) store `dir\file`; the spec
    // says '/'. Normalize so paths compare consistently — `..` / absolute /
    // drive-letter names are still rejected downstream (zip-slip guard).
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen).replaceAll('\\', '/');

    let unreadable: string | null = null;
    if (flags & 0x1) unreadable = 'encrypted entry';
    else if (size === 0xffffffff || compressedSize === 0xffffffff) unreadable = 'ZIP64 entry';
    else if (method !== 0 && method !== 8) unreadable = `unsupported compression method ${method}`;

    const madeOnUnix = versionMadeBy >> 8 === 3;
    entries.push({
      name,
      isDirectory: name.endsWith('/'),
      size,
      unixMode: madeOnUnix ? (externalAttrs >>> 16) & 0xffff : 0,
      unreadable,
      method,
      compressedSize,
      localHeaderOffset,
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Inflate one entry's bytes, capped at `maxBytes` (throws past the cap). */
export function readZipEntry(buf: Buffer, entry: ZipEntry, maxBytes: number): Buffer {
  if (entry.unreadable) throw new ValidationError(`Cannot read ${entry.name}: ${entry.unreadable}`);
  if (entry.size > maxBytes) throw new ValidationError(`${entry.name} is too large`);
  const lh = entry.localHeaderOffset;
  if (lh + 30 > buf.length || buf.readUInt32LE(lh) !== LFH_SIG) {
    throw new ValidationError(`Corrupt local header for ${entry.name}`);
  }
  const start = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
  const end = start + entry.compressedSize;
  if (end > buf.length) throw new ValidationError(`Truncated data for ${entry.name}`);
  const data = buf.subarray(start, end);
  if (entry.method === 0) {
    // Stored entries: the declared size can lie, so cap the real byte count too.
    if (data.length > maxBytes) throw new ValidationError(`${entry.name} is too large`);
    return Buffer.from(data);
  }
  try {
    return inflateRawSync(data, { maxOutputLength: maxBytes });
  } catch {
    throw new ValidationError(`${entry.name} could not be decompressed (corrupt or too large)`);
  }
}
