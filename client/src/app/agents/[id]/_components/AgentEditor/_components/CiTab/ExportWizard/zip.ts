/**
 * Minimal client-side ZIP writer (STORE method — no compression) for the
 * "Copy files as a zip" degraded path (AC-13). Deliberately dependency-free:
 * this is the only place in the wizard that needs archive support, and the
 * client has no zip library installed — adding one is out of scope for this
 * task's owned paths (package.json). STORE is enough for a handful of small
 * text files (workflow YAML, agent manifest, skill markdown, memory.jsonl).
 */

export interface ZipEntryInput {
  path: string;
  contents: string;
}

const encoder = new TextEncoder();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    let c = (crc ^ data[i]!) & 0xff;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function u32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

/** Builds a valid (if minimal) .zip archive from a set of text files. */
export function buildZip(entries: ZipEntryInput[]): Blob {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const dataBytes = encoder.encode(entry.contents);
    const crc = crc32(dataBytes);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50);
    u16(lv, 4, 20); // version needed
    u16(lv, 6, 0); // flags
    u16(lv, 8, 0); // method: store
    u16(lv, 10, 0); // mod time
    u16(lv, 12, 0x21); // mod date: 1980-01-01
    u32(lv, 14, crc);
    u32(lv, 18, dataBytes.length); // compressed size
    u32(lv, 22, dataBytes.length); // uncompressed size
    u16(lv, 26, nameBytes.length);
    u16(lv, 28, 0); // extra length
    local.set(nameBytes, 30);
    localParts.push(local, dataBytes);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    u32(cv, 0, 0x02014b50);
    u16(cv, 4, 20); // version made by
    u16(cv, 6, 20); // version needed
    u16(cv, 8, 0);
    u16(cv, 10, 0);
    u16(cv, 12, 0);
    u16(cv, 14, 0x21);
    u32(cv, 16, crc);
    u32(cv, 20, dataBytes.length);
    u32(cv, 24, dataBytes.length);
    u16(cv, 28, nameBytes.length);
    u16(cv, 30, 0);
    u16(cv, 32, 0);
    u16(cv, 34, 0);
    u16(cv, 36, 0);
    u32(cv, 38, 0);
    u32(cv, 42, offset);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + dataBytes.length;
  }

  const centralStart = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50);
  u16(ev, 4, 0);
  u16(ev, 6, 0);
  u16(ev, 8, entries.length);
  u16(ev, 10, entries.length);
  u32(ev, 12, centralSize);
  u32(ev, 16, centralStart);
  u16(ev, 20, 0);

  // Cast: TS's DOM lib types `Uint8Array` as generic over its backing buffer
  // (`ArrayBufferLike` vs `BlobPart`'s required `ArrayBuffer`), but every array
  // here is a plain `new Uint8Array(n)` — always backed by a real ArrayBuffer.
  const parts = [...localParts, ...centralParts, end] as BlobPart[];
  return new Blob(parts, { type: "application/zip" });
}

/** Triggers a browser download of `blob` named `filename`. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
