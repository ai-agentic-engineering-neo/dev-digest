/* extract.ts — pure, client-side skill extraction for the Add Skill modal.

   Reads a `.md` / `.markdown` file or a `.zip` archive and returns the skill
   text plus any front-matter metadata. Security posture for archives: only
   text-like entries (.md/.markdown/.txt) are ever decompressed, and only ONE
   of them (the "core" skill file) is read. Every other entry (scripts,
   binaries, ...) is never read, decompressed or executed — its path is just
   reported back in `ignored`. Nothing here touches the network or the DOM. */

import JSZip from "jszip";

/** Archives with more entries than this are rejected (zip-bomb guard). */
export const MAX_ARCHIVE_ENTRIES = 500;
/** Maximum uncompressed size of the text we are willing to read. */
export const MAX_TEXT_BYTES = 256 * 1024;

const MARKDOWN_EXTENSIONS = [".md", ".markdown"] as const;
const ARCHIVE_EXTENSION = ".zip";
const TEXT_ENTRY_EXTENSIONS = [".md", ".markdown", ".txt"] as const;
const MAX_NAME_LENGTH = 64;

export type ExtractErrorCode =
  | "unsupported_type"
  | "too_many_entries"
  | "too_large"
  | "no_text_entry"
  | "invalid_archive"
  | "not_text"
  | "empty";

/** Extraction failure with a stable `code` the UI maps to a translated message. */
export class ExtractError extends Error {
  readonly code: ExtractErrorCode;
  readonly params: Record<string, string | number>;
  constructor(code: ExtractErrorCode, params: Record<string, string | number> = {}) {
    super(code);
    this.name = "ExtractError";
    this.code = code;
    this.params = params;
  }
}

export interface ExtractedSkill {
  /** `name:` from YAML front-matter, or "" when absent. */
  name: string;
  /** Kebab-case name derived from the first `# heading`, or "" when none. */
  headingName: string;
  /** `description:` from YAML front-matter, or "". */
  description: string;
  /** Skill text with any front-matter block stripped. */
  body: string;
  /** The file the text came from: the picked file, or the chosen archive entry path. */
  sourceFile: string;
  /** Archive entries that were NOT processed (empty for plain files). */
  ignored: string[];
}

/** Accept attribute value for the file input. */
export const ACCEPTED_FILE_TYPES = [...MARKDOWN_EXTENSIONS, ARCHIVE_EXTENSION].join(",");

function extensionOf(path: string): string {
  const base = baseName(path);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot).toLowerCase();
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Read a Blob as text (jsdom's File lacks `.text()`, so fall back to FileReader). */
async function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsText(blob);
  });
}

// ---- front-matter --------------------------------------------------------

const FRONT_MATTER = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) return v.slice(1, -1);
  return v;
}

/** Minimal `key: value` parse of a front-matter block (no YAML library). */
function parseFrontMatterBlock(block: string): { name: string; description: string } {
  const out = { name: "", description: "" };
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(name|description)\s*:\s*(.*)$/.exec(lines[i] ?? "");
    if (!m) continue;
    const key = m[1] as "name" | "description";
    let value = (m[2] ?? "").trim();
    // Block scalar (`>` folded / `|` literal): gather the indented continuation lines.
    if (/^[>|][+-]?$/.test(value)) {
      const folded = value.startsWith(">");
      const parts: string[] = [];
      for (let next = lines[i + 1]; next !== undefined && /^\s+\S/.test(next); next = lines[i + 1]) {
        parts.push(next.trim());
        i++;
      }
      value = parts.join(folded ? " " : "\n");
    }
    out[key] = unquote(value);
  }
  return out;
}

/** Split off a leading YAML front-matter block; returns its name/description and the rest. */
export function parseFrontMatter(text: string): { name: string; description: string; body: string } {
  const m = FRONT_MATTER.exec(text);
  if (!m) return { name: "", description: "", body: text };
  return { ...parseFrontMatterBlock(m[1] ?? ""), body: text.slice(m[0].length).replace(/^(?:\r?\n)+/, "") };
}

/** kebab-case slug: lowercase, non-alphanumerics collapsed to `-`, capped in length. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_NAME_LENGTH)
    .replace(/-+$/g, "");
}

/** Kebab-case name from the first level-1 `# heading` (outside code fences), or "". */
export function deriveNameFromBody(body: string): string {
  let inFence = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) return slugify(m[1] ?? "");
  }
  return "";
}

/** Turn raw file text into an ExtractedSkill (shared by the .md and .zip paths). */
export function buildExtracted(raw: string, sourceFile: string, ignored: string[]): ExtractedSkill {
  if (raw.includes("\u0000")) throw new ExtractError("not_text", { file: sourceFile });
  const fm = parseFrontMatter(raw);
  const body = fm.body.trim() ? fm.body : "";
  if (!body) throw new ExtractError("empty", { file: sourceFile });
  return {
    name: fm.name,
    headingName: deriveNameFromBody(body),
    description: fm.description,
    body,
    sourceFile,
    ignored,
  };
}

// ---- archives ------------------------------------------------------------

interface ZipEntry {
  path: string;
  size: number;
  obj: JSZip.JSZipObject;
}

/** Declared uncompressed size from the central directory (JSZip verifies it while inflating). */
function declaredSize(obj: JSZip.JSZipObject): number {
  const data = (obj as unknown as { _data?: { uncompressedSize?: number } })._data;
  return typeof data?.uncompressedSize === "number" ? data.uncompressedSize : 0;
}

function isNoise(path: string): boolean {
  return path.startsWith("__MACOSX/") || baseName(path) === ".DS_Store";
}

function isTextCandidate(path: string): boolean {
  return (
    !path.split("/").some((seg) => seg.startsWith(".")) &&
    (TEXT_ENTRY_EXTENSIONS as readonly string[]).includes(extensionOf(path))
  );
}

/** Pick the "core" skill file: SKILL.md, else README.md, else the largest text entry. */
export function pickCoreEntry<T extends { path: string; size: number }>(candidates: T[]): T | undefined {
  const shallowest = (a: T, b: T) => a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path);
  const named = (target: string) =>
    candidates.filter((c) => baseName(c.path).toLowerCase() === target).sort(shallowest)[0];
  return named("skill.md") ?? named("readme.md") ?? [...candidates].sort((a, b) => b.size - a.size)[0];
}

async function extractFromZip(file: File): Promise<ExtractedSkill> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new ExtractError("invalid_archive");
  }
  const entries: ZipEntry[] = Object.values(zip.files)
    .filter((o) => !o.dir)
    .map((obj) => ({ path: obj.name, size: declaredSize(obj), obj }));
  if (Object.keys(zip.files).length > MAX_ARCHIVE_ENTRIES) {
    throw new ExtractError("too_many_entries", { max: MAX_ARCHIVE_ENTRIES });
  }

  const candidates = entries.filter((e) => !isNoise(e.path) && isTextCandidate(e.path));
  const core = pickCoreEntry(candidates);
  if (!core) throw new ExtractError("no_text_entry");
  if (core.size > MAX_TEXT_BYTES) {
    throw new ExtractError("too_large", { file: core.path, kb: MAX_TEXT_BYTES / 1024 });
  }

  // Only the chosen entry is decompressed; everything else is merely listed.
  let raw: string;
  try {
    raw = await core.obj.async("string");
  } catch {
    throw new ExtractError("invalid_archive");
  }
  if (raw.length > MAX_TEXT_BYTES) throw new ExtractError("too_large", { file: core.path, kb: MAX_TEXT_BYTES / 1024 });

  const ignored = entries.filter((e) => e !== core && !isNoise(e.path)).map((e) => e.path);
  return buildExtracted(raw, core.path, ignored);
}

/**
 * Extract a skill from a picked `.md`/`.markdown` file or `.zip` archive.
 * Throws {@link ExtractError} for unsupported/oversized/binary/empty input.
 */
export async function extractSkillFile(file: File): Promise<ExtractedSkill> {
  const ext = extensionOf(file.name);
  if (ext === ARCHIVE_EXTENSION) return extractFromZip(file);
  if (!(MARKDOWN_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new ExtractError("unsupported_type", { file: file.name });
  }
  if (file.size > MAX_TEXT_BYTES) throw new ExtractError("too_large", { file: file.name, kb: MAX_TEXT_BYTES / 1024 });
  return buildExtracted(await readBlobText(file), file.name, []);
}
