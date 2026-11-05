import { SkillType } from '@devdigest/shared';
import { ValidationError } from '../../../platform/errors.js';
import {
  EXECUTABLE_EXTENSIONS,
  MAX_ARCHIVE_ENTRIES,
  MAX_ARCHIVE_ENTRY_BYTES,
  MAX_ARCHIVE_TOTAL_BYTES,
  MAX_IMPORT_BYTES,
  MAX_SKILL_BODY_CHARS,
  SKILL_ENTRY_FILENAME,
  TEXT_EXTENSIONS,
} from '../constants.js';
import { SKILL_NAME_PATTERN, toSkillSlug, type SkillImportFile, type SkillImportPreview } from '../domain.js';
import { parseFrontmatter } from './frontmatter.js';
import { isZip, listZipEntries, readZipEntry, type ZipEntry } from './zip-reader.js';

/**
 * Skill import: a `.md` file or a `.zip` skill folder → a PREVIEW (nothing is
 * saved here). Only markdown/text is read; scripts and binaries in an archive
 * are listed as `ignored` and never decompressed, let alone executed.
 */

/** Frontmatter keys we understand; anything else is reported, never applied. */
const KNOWN_KEYS = new Set(['name', 'description', 'type', 'version', 'license', 'metadata']);

const MARKDOWN_EXTENSIONS = ['.md', '.markdown'];

function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot);
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function depth(path: string): number {
  return path.split('/').length;
}

/** Entry name (separators already normalized to '/') that would escape the archive root (zip-slip). */
function isUnsafePath(name: string): boolean {
  if (name.includes('\0')) return true;
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) return true;
  return name.split('/').some((seg) => seg === '..');
}

function decodeText(buf: Buffer, label: string): string {
  if (buf.includes(0)) throw new ValidationError(`${label} is not a text file`);
  return buf.toString('utf8');
}

interface ParsedSource {
  /** Entry markdown (with frontmatter). */
  entryText: string;
  entryLabel: string;
  /** Additional markdown/text references, path-sorted. */
  references: { path: string; text: string }[];
  files: SkillImportFile[];
}

function fromMarkdown(filename: string, buf: Buffer): ParsedSource {
  const ext = extOf(filename);
  if (!TEXT_EXTENSIONS.includes(ext)) {
    throw new ValidationError('Upload a markdown file (.md) or a .zip skill archive');
  }
  return {
    entryText: decodeText(buf, filename),
    entryLabel: filename,
    references: [],
    files: [{ path: filename, size: buf.length, status: 'used', reason: null }],
  };
}

function fromZip(buf: Buffer): ParsedSource {
  const entries = listZipEntries(buf, {
    maxEntries: MAX_ARCHIVE_ENTRIES,
    maxEntryBytes: MAX_ARCHIVE_ENTRY_BYTES,
  }).filter((e) => !e.isDirectory && !e.name.startsWith('__MACOSX/'));

  const files: SkillImportFile[] = [];
  const textEntries: ZipEntry[] = [];
  for (const e of entries) {
    const ext = extOf(e.name);
    const ignore = (reason: string) =>
      files.push({ path: e.name, size: e.size, status: 'ignored', reason });
    if (isUnsafePath(e.name)) ignore('unsafe path (would escape the archive root)');
    else if (EXECUTABLE_EXTENSIONS.includes(ext)) ignore('executable / script — never run or read');
    else if (!TEXT_EXTENSIONS.includes(ext)) {
      ignore(e.unixMode & 0o111 ? 'executable (has +x bit) — never run or read' : 'unsupported file type');
    } else if (e.unreadable) ignore(e.unreadable);
    else if (e.size > MAX_ARCHIVE_ENTRY_BYTES) ignore('file too large');
    else textEntries.push(e);
  }

  const markdown = textEntries.filter((e) => MARKDOWN_EXTENSIONS.includes(extOf(e.name)));
  const byDepth = (a: ZipEntry, b: ZipEntry) => depth(a.name) - depth(b.name) || a.name.localeCompare(b.name);
  const entry =
    markdown.filter((e) => baseName(e.name).toLowerCase() === SKILL_ENTRY_FILENAME).sort(byDepth)[0] ??
    (markdown.length === 1 ? markdown[0] : undefined);
  if (!entry) {
    throw new ValidationError(
      'Archive must contain SKILL.md (or exactly one markdown file) — no skill entry found',
    );
  }

  let totalBytes = 0;
  const read = (e: ZipEntry): string => {
    // Cap each inflate at the REMAINING total budget, so the archive-wide limit
    // stops decompression up front instead of being checked after the fact.
    const remaining = MAX_ARCHIVE_TOTAL_BYTES - totalBytes;
    if (remaining <= 0 || e.size > remaining) {
      throw new ValidationError('Archive content exceeds the size limit');
    }
    const data = readZipEntry(buf, e, Math.min(MAX_ARCHIVE_ENTRY_BYTES, remaining));
    totalBytes += data.length;
    return decodeText(data, e.name);
  };

  const entryText = read(entry);
  files.push({ path: entry.name, size: entry.size, status: 'used', reason: 'skill entry' });

  const references: { path: string; text: string }[] = [];
  for (const e of textEntries.filter((x) => x !== entry).sort((a, b) => a.name.localeCompare(b.name))) {
    try {
      references.push({ path: e.name, text: read(e) });
      files.push({ path: e.name, size: e.size, status: 'used', reason: 'reference' });
    } catch (err) {
      files.push({ path: e.name, size: e.size, status: 'ignored', reason: (err as Error).message });
    }
  }
  return { entryText, entryLabel: entry.name, references, files };
}

/**
 * Parse an uploaded skill into a preview. `filename` picks .md vs .zip (the
 * ZIP magic number is checked too). Throws ValidationError on unusable input.
 */
export function buildImportPreview(filename: string, buf: Buffer): SkillImportPreview {
  if (buf.length === 0) throw new ValidationError('The uploaded file is empty');
  if (buf.length > MAX_IMPORT_BYTES) {
    throw new ValidationError(`File is too large (limit ${Math.round(MAX_IMPORT_BYTES / 1024)} KiB)`);
  }

  const zip = extOf(filename) === '.zip' || isZip(buf);
  const src = zip ? fromZip(buf) : fromMarkdown(filename, buf);
  const warnings: string[] = [];

  const fm = parseFrontmatter(src.entryText);

  // name — kebab-case identifier; fall back to the folder / file name.
  const folder = src.entryLabel.includes('/') ? src.entryLabel.split('/').slice(-2, -1)[0]! : '';
  const rawName = fm.data.name || folder || filename;
  let name = rawName.trim();
  if (!SKILL_NAME_PATTERN.test(name)) {
    name = toSkillSlug(rawName) || 'imported-skill';
    warnings.push(`Name "${rawName}" was normalized to "${name}" (kebab-case).`);
  }

  const description = (fm.data.description ?? '').trim();
  if (!description) {
    warnings.push('No description in the frontmatter — write a directive one before saving.');
  }

  const typeParse = SkillType.safeParse((fm.data.type ?? '').trim().toLowerCase());
  const type = typeParse.success ? typeParse.data : 'custom';
  if (fm.data.type && !typeParse.success) {
    warnings.push(`Unknown type "${fm.data.type}" — defaulted to "custom".`);
  }

  const unknownKeys = Object.keys(fm.data).filter((k) => !KNOWN_KEYS.has(k));
  if (unknownKeys.length > 0) {
    warnings.push(
      `Frontmatter key(s) ignored: ${unknownKeys.join(', ')}. Skills are text only — they cannot use tools or run code.`,
    );
  }

  let body = fm.body.trim();
  for (const ref of src.references) {
    const refBody = parseFrontmatter(ref.text).body.trim();
    if (!refBody) continue;
    body += `\n\n---\n## Reference: ${ref.path}\n\n${refBody}`;
  }
  if (!body) throw new ValidationError('The skill body is empty');
  if (body.length > MAX_SKILL_BODY_CHARS) {
    body = body.slice(0, MAX_SKILL_BODY_CHARS);
    warnings.push(`Body truncated to ${MAX_SKILL_BODY_CHARS} characters.`);
  }

  const ignored = src.files.filter((f) => f.status === 'ignored');
  if (ignored.length > 0) {
    warnings.push(
      `${ignored.length} file(s) were ignored — only markdown/text is read; nothing from the archive is executed.`,
    );
  }

  return { name, description, type, body, files: src.files, warnings };
}
