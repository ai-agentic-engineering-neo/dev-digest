import type { SkillType } from "@devdigest/shared";

/** One entry of a ZIP central directory. `method` 0 = stored, 8 = deflate. */
export interface ArchiveEntry {
  name: string;
  /** Uncompressed size. */
  size: number;
  /** Compressed size — the exact byte count to hand the decompressor. */
  compressedSize: number;
  method: number;
  localOffset: number;
}

/**
 * Ceilings for an imported archive. A skill body is Markdown — a couple of
 * hundred KB is already generous — while DEFLATE reaches ~1000:1, so a small
 * upload can expand to gigabytes and hang the tab. Both limits are cheap to
 * raise and expensive to omit.
 */
export const MAX_ARCHIVE_BYTES = 10 * 1024 * 1024;
export const MAX_SKILL_BYTES = 2 * 1024 * 1024;

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
const DEC = new TextDecoder();

/**
 * List a ZIP's entries by walking its central directory.
 *
 * Deliberately only LISTS: nothing is decompressed here, so an archive's
 * scripts and binaries are never read — their names are all we show. The one
 * markdown file the user confirms is the only entry `readZipText` touches.
 * Written against the platform (`DecompressionStream`) instead of a zip
 * library, which would happily inflate everything.
 */
export function readZipEntries(buf: ArrayBuffer): ArchiveEntry[] {
  const v = new DataView(buf);
  // The end-of-central-directory record sits at the end, after a comment of
  // unknown length — scan backwards for its signature.
  let eocd = -1;
  const floor = Math.max(0, buf.byteLength - 22 - 0xffff);
  for (let i = buf.byteLength - 22; i >= floor; i--) {
    if (v.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip archive");

  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const entries: ArchiveEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== SIG_CENTRAL) throw new Error("corrupt zip central directory");
    const nameLen = v.getUint16(p + 28, true);
    entries.push({
      method: v.getUint16(p + 10, true),
      compressedSize: v.getUint32(p + 20, true),
      size: v.getUint32(p + 24, true),
      name: DEC.decode(new Uint8Array(buf, p + 46, nameLen)),
      localOffset: v.getUint32(p + 42, true),
    });
    p += 46 + nameLen + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return entries;
}

/**
 * Read ONE entry as text. Stored entries are sliced; deflated ones go through
 * the platform's DecompressionStream.
 *
 * The slice is EXACTLY `compressedSize` bytes: an entry is followed by the next
 * entry and the central directory, and a deflate stream handed anything past
 * its own end fails with "Junk found after end of compressed data". The sizes
 * come from the central directory because a local header may leave them zero
 * (data-descriptor entries).
 */
export async function readZipText(buf: ArrayBuffer, entry: ArchiveEntry): Promise<string> {
  const v = new DataView(buf);
  const o = entry.localOffset;
  if (v.getUint32(o, true) !== SIG_LOCAL) throw new Error("corrupt zip entry");
  const start = o + 30 + v.getUint16(o + 26, true) + v.getUint16(o + 28, true);
  if (entry.method === 0) return DEC.decode(new Uint8Array(buf, start, entry.size));
  if (entry.method !== 8) throw new Error("unsupported compression");

  if (entry.size > MAX_SKILL_BYTES) throw new Error("skill file too large");

  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  // Swallowed on purpose: when the read loop cancels (over the cap, or a
  // corrupt stream) these reject with the same failure the reader already
  // throws, and an unhandled rejection would surface as noise in the console.
  writer.write(new Uint8Array(buf, start, entry.compressedSize)).catch(() => {});
  writer.close().catch(() => {});

  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    // The declared size is the archive's own claim; this is the real one.
    if (total > MAX_SKILL_BYTES) {
      await reader.cancel();
      throw new Error("skill file too large");
    }
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return DEC.decode(out);
}

const isDir = (e: ArchiveEntry) => e.name.endsWith("/");
const isMarkdown = (e: ArchiveEntry) => /\.(md|markdown)$/i.test(e.name);

/**
 * The archive's skill body: `SKILL.md` if present, else the shallowest
 * markdown file (ties broken by name, so the pick is deterministic).
 */
export function pickSkillEntry(entries: ArchiveEntry[]): ArchiveEntry | undefined {
  const md = entries.filter((e) => !isDir(e) && isMarkdown(e));
  const named = md.find((e) => /(^|\/)SKILL\.md$/i.test(e.name));
  if (named) return named;
  return md.sort((a, b) => {
    const depth = a.name.split("/").length - b.name.split("/").length;
    return depth !== 0 ? depth : a.name.localeCompare(b.name);
  })[0];
}

/** Everything the import will NOT read — shown to the user so it is visible
    that the archive's executable half was skipped, not silently dropped. */
export function ignoredEntries(entries: ArchiveEntry[], picked?: ArchiveEntry): string[] {
  return entries.filter((e) => !isDir(e) && e.name !== picked?.name).map((e) => e.name);
}

export interface ParsedSkill {
  name: string;
  description: string;
  body: string;
}

/**
 * Pull a name and description out of a skill markdown: YAML front matter first
 * (the convention agent-skill archives use), then the first `# ` heading and
 * the first paragraph under it. The body is the file, unchanged — front matter
 * included, because trimming it would change the text the user just reviewed.
 */
export function parseSkillMarkdown(text: string, fallbackName = ""): ParsedSkill {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const field = (key: string) => {
    if (!fm) return "";
    const m = new RegExp(`^${key}:\\s*(.+)$`, "mi").exec(fm[1]!);
    return m ? m[1]!.trim().replace(/^["']|["']$/g, "") : "";
  };

  const afterFm = fm ? text.slice(fm[0].length) : text;
  const heading = /^#\s+(.+)$/m.exec(afterFm);
  const paragraph = afterFm
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .find((p) => p.length > 0 && !p.startsWith("#") && !p.startsWith("```"));

  return {
    name: field("name") || heading?.[1]?.trim() || fallbackName,
    description: field("description") || (paragraph ? paragraph.replace(/\s+/g, " ") : ""),
    body: text,
  };
}

/** A filename without its extension, usable as a skill name. */
export function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_\s]+/g, "-");
}

/** Guess a type from the skill's own words — the user can change it before
    saving; this only saves a click on the common cases. */
export function guessType(text: string): SkillType {
  const t = text.toLowerCase();
  if (/\b(security|vulnerab|injection|secret|auth)\b/.test(t)) return "security";
  if (/\b(rubric|checklist|score|criteria)\b/.test(t)) return "rubric";
  if (/\b(convention|style|naming|lint)\b/.test(t)) return "convention";
  return "custom";
}
