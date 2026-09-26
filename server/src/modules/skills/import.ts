import { unzipSync } from 'fflate';
import { SkillType, type SkillImportPreview } from '@devdigest/shared';

/**
 * A1 — skill import parsing (S6). PURE: no Fastify, no DB, no filesystem
 * writes, no network. S1 governs this whole file — nothing parsed here is ever
 * executed, and a `.zip`'s non-target entries are enumerated by name only,
 * never decompressed.
 */

export class SkillImportError extends Error {}

const MAX_BYTES = 1024 * 1024; // 1 MB total, per spec
const MAX_ENTRIES = 200;

// ---------------------------------------------------------------- frontmatter

interface ParsedFrontmatter {
  name?: string;
  description?: string;
  type?: string;
  body: string;
  hasFrontmatter: boolean;
}

/**
 * Minimal `---\nkey: value\n---` parser for the narrow case this needs — no
 * YAML library. Lines without a `:` are ignored; values are not unquoted.
 */
function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!match) return { body: content, hasFrontmatter: false };

  const fields: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (!key) continue;
    fields[key] = line.slice(idx + 1).trim();
  }

  return {
    name: fields.name,
    description: fields.description,
    type: fields.type,
    body: content.slice(match[0].length),
    hasFrontmatter: true,
  };
}

function stripExtension(name: string): string {
  return name.replace(/\.[^./]+$/, '');
}

function isSkillType(value: string | undefined): value is SkillImportPreview['type'] {
  return value !== undefined && SkillType.safeParse(value).success;
}

// ---------------------------------------------------------------------- .md

/** The whole file IS the body (frontmatter stripped); frontmatter supplies name/description/type. */
export function parseMarkdownImport(filename: string, content: string): SkillImportPreview {
  const parsed = parseFrontmatter(content);
  const warnings: string[] = [];

  if (!parsed.hasFrontmatter) {
    warnings.push('No frontmatter found — name, description and type were inferred, not declared.');
  } else if (parsed.type !== undefined && !isSkillType(parsed.type)) {
    warnings.push(`Unknown type "${parsed.type}" in frontmatter — defaulted to "custom".`);
  }

  return {
    name: parsed.name || stripExtension(filename),
    description: parsed.description || 'Imported skill',
    type: isSkillType(parsed.type) ? parsed.type : 'custom',
    body: parsed.body.trim(),
    ignored_files: [],
    warnings,
  };
}

// --------------------------------------------------------------------- .zip

function dirName(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

function baseName(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

/** The single shared first path segment, if every entry has one — e.g. `my-skill/`. */
function commonTopLevelFolder(names: string[]): string | undefined {
  if (names.length === 0) return undefined;
  const first = names[0]!.split('/')[0];
  if (!first) return undefined;
  return names.every((n) => n.split('/')[0] === first) ? first : undefined;
}

/**
 * .zip import. `SKILL.md` (case-insensitive) at the root or inside the single
 * top-level folder wins; failing that, exactly one `.md` file anywhere in the
 * archive is used as a fallback. Every other file is reported in
 * `ignored_files` BY NAME ONLY.
 *
 * Two `unzipSync` passes: the first always returns `false` from `filter`,
 * which makes fflate enumerate entry names without ever running inflate on
 * them (S1 — ignored files' bytes are never read); the second decompresses
 * only the resolved target.
 */
export function parseZipImport(filename: string, bytes: Uint8Array): SkillImportPreview {
  const allNames: string[] = [];
  try {
    unzipSync(bytes, {
      filter: (file) => {
        allNames.push(file.name);
        return false;
      },
    });
  } catch (err) {
    throw new SkillImportError(
      `Could not read "${filename}" as a zip archive: ${(err as Error).message}`,
    );
  }

  if (allNames.length > MAX_ENTRIES) {
    throw new SkillImportError(`Archive has too many entries (max ${MAX_ENTRIES}).`);
  }

  const fileNames = allNames.filter((n) => !n.endsWith('/'));
  const topLevel = commonTopLevelFolder(fileNames);

  const skillMdCandidates = fileNames.filter((n) => {
    if (baseName(n).toLowerCase() !== 'skill.md') return false;
    const dir = dirName(n);
    return dir === '' || dir === topLevel;
  });

  let target = skillMdCandidates[0];
  if (!target) {
    const mdFiles = fileNames.filter((n) => baseName(n).toLowerCase().endsWith('.md'));
    if (mdFiles.length === 1) target = mdFiles[0];
  }
  if (!target) {
    throw new SkillImportError(
      'No SKILL.md found at the archive root (or its single top-level folder), and no single .md fallback file exists.',
    );
  }

  const ignoredFiles = fileNames.filter((n) => n !== target);

  const extracted = unzipSync(bytes, { filter: (file) => file.name === target });
  const contentBytes = extracted[target];
  if (!contentBytes) {
    throw new SkillImportError(`Failed to read "${target}" from the archive.`);
  }
  const content = new TextDecoder('utf-8').decode(contentBytes);

  const preview = parseMarkdownImport(baseName(target), content);
  return { ...preview, ignored_files: ignoredFiles };
}

// ------------------------------------------------------------------ entry

/** `POST /skills/import/preview` — dispatches on extension. Writes nothing (S6). */
export function parseSkillImport(filename: string, contentBase64: string): SkillImportPreview {
  const bytes = Buffer.from(contentBase64, 'base64');
  if (bytes.byteLength > MAX_BYTES) {
    throw new SkillImportError('Import exceeds the 1 MB size limit.');
  }

  const lower = filename.toLowerCase();
  if (lower.endsWith('.zip')) return parseZipImport(filename, bytes);
  if (lower.endsWith('.md')) return parseMarkdownImport(filename, bytes.toString('utf-8'));
  throw new SkillImportError(`Unsupported file type for "${filename}" — expected .md or .zip.`);
}
