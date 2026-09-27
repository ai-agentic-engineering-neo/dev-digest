import { SkillType } from '@devdigest/shared';
import type {
  SkillImportPreview,
  SkillSkipReason,
  SkillSkippedFile,
} from '@devdigest/shared';
import { listZipEntries, looksLikeZip, readZipEntryText, ArchiveError } from './archive.js';
import {
  CORE_FILE_NAMES,
  DEFAULT_IMPORT_TYPE,
  EXECUTABLE_DIRS,
  EXECUTABLE_EXTENSIONS,
  FALLBACK_DESCRIPTION,
  MAX_BODY_CHARS,
  MAX_ENTRY_BYTES,
} from './constants.js';

/**
 * Pure extraction: bytes → the skill core we are willing to show the user.
 *
 * "Core" means exactly one markdown document plus whatever its frontmatter
 * declares. Everything else in an archive is reported, never unpacked — an
 * imported skill must not be able to smuggle anything executable into the
 * product, and the preview is where that promise is made visible.
 *
 * No I/O here: every function takes a Buffer/string and returns data.
 */

export class ExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractError';
  }
}

// Derived, not repeated: a subset of a union is assignable to `readonly
// SkillType[]`, so a hand-written list would keep compiling after a fifth type
// is added to the contract and silently downgrade every import declaring it.
const VALID_TYPES = SkillType.options;

export interface Frontmatter {
  data: Record<string, string>;
  body: string;
}

/**
 * Read a `---` fenced header as flat `key: value` pairs.
 *
 * Deliberately not a YAML parser: skill frontmatter in the wild is a handful of
 * scalars, and accepting anything richer would mean running a parser over
 * untrusted text for fields we do not read. Unknown keys are ignored; a nested
 * block is skipped rather than guessed at.
 */
export function parseFrontmatter(text: string): Frontmatter {
  const normalized = text.replace(/^﻿/, '');
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(normalized);
  if (!match) return { data: {}, body: normalized };

  const data: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2]!.trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    if (value) data[kv[1]!.toLowerCase()] = value;
  }
  return { data, body: normalized.slice(match[0].length) };
}

/** Skill names are kebab-case identifiers, like the files they came from. */
export function slugifySkillName(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/\.(md|markdown)$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || 'imported-skill';
}

/** First ATX heading of a markdown document, if it has one. */
function firstHeading(body: string): string | undefined {
  const m = /^#{1,3}[ \t]+(.+)$/m.exec(body);
  return m?.[1]?.trim();
}

/** First non-empty, non-heading paragraph — the fallback description. */
function firstParagraph(body: string): string | undefined {
  for (const block of body.split(/\r?\n\s*\r?\n/)) {
    const text = block.trim();
    if (!text || text.startsWith('#') || text.startsWith('---')) continue;
    return text.replace(/\s+/g, ' ').slice(0, 280);
  }
  return undefined;
}

function asSkillType(raw: string | undefined): SkillType | undefined {
  if (!raw) return undefined;
  const value = raw.trim().toLowerCase();
  return VALID_TYPES.find((t) => t === value);
}

export interface SkillCore {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  warnings: string[];
}

/**
 * One markdown document → the fields the editor will show.
 *
 * The BODY keeps its frontmatter stripped but is otherwise verbatim: what the
 * user previews is byte-for-byte what an agent's prompt will carry.
 */
export function skillCoreFromMarkdown(text: string, filename: string): SkillCore {
  const { data, body } = parseFrontmatter(text);
  const warnings: string[] = [];

  const trimmed = body.trim();
  if (!trimmed) throw new ExtractError('The file contains no skill body.');
  if (trimmed.length > MAX_BODY_CHARS) {
    throw new ExtractError(
      `Skill body is ${trimmed.length} characters (limit ${MAX_BODY_CHARS}).`,
    );
  }

  let name = data.name;
  if (!name) {
    name = firstHeading(trimmed) ?? filename;
    warnings.push('No `name` in frontmatter — derived from the document.');
  }

  let description = data.description;
  if (!description) {
    description = firstParagraph(trimmed) ?? FALLBACK_DESCRIPTION;
    warnings.push('No `description` in frontmatter — derived from the first paragraph.');
  }

  const declaredType = asSkillType(data.type);
  if (data.type && !declaredType) {
    warnings.push(`Unknown type "${data.type}" — imported as ${DEFAULT_IMPORT_TYPE}.`);
  }

  return {
    name: slugifySkillName(name),
    description: description.slice(0, 500),
    type: declaredType ?? DEFAULT_IMPORT_TYPE,
    body: trimmed,
    warnings,
  };
}

const MARKDOWN_RE = /\.(md|markdown)$/i;

/** Why this archive entry cannot be the skill core (undefined = it can). */
export function classifyEntry(path: string, size: number): SkillSkipReason | undefined {
  const segments = path.split('/');
  const base = segments[segments.length - 1]!.toLowerCase();
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1) : '';
  const inExecutableDir = segments
    .slice(0, -1)
    .some((d) => (EXECUTABLE_DIRS as readonly string[]).includes(d.toLowerCase()));

  if ((EXECUTABLE_EXTENSIONS as readonly string[]).includes(ext)) return 'executable';
  if (inExecutableDir) return 'executable';
  if (!MARKDOWN_RE.test(base)) return 'not-markdown';
  if (size > MAX_ENTRY_BYTES) return 'too-large';
  return undefined;
}

/** Best core candidate first: a known core filename, then the shallowest path. */
function rankCandidate(path: string): number {
  const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  const known = (CORE_FILE_NAMES as readonly string[]).indexOf(base);
  const depth = path.split('/').length;
  return (known === -1 ? CORE_FILE_NAMES.length : known) * 100 + depth;
}

/**
 * Archive → preview. Only the winning markdown entry is ever decompressed;
 * every other entry is listed with the reason it was left behind.
 */
export function previewFromArchive(buf: Buffer, source: SkillImportPreview['source']): SkillImportPreview {
  const entries = listZipEntries(buf).filter((e) => !e.directory);
  if (entries.length === 0) throw new ExtractError('The archive is empty.');

  const skipped: SkillSkippedFile[] = [];
  const candidates: typeof entries = [];
  for (const entry of entries) {
    const reason = classifyEntry(entry.path, entry.size);
    if (reason) skipped.push({ path: entry.path, reason });
    else candidates.push(entry);
  }
  if (candidates.length === 0) {
    throw new ExtractError('No markdown file in the archive — nothing to import.');
  }

  candidates.sort((a, b) => rankCandidate(a.path) - rankCandidate(b.path));
  const core = candidates[0]!;
  for (const rest of candidates.slice(1)) skipped.push({ path: rest.path, reason: 'not-core' });

  const text = readZipEntryText(buf, core);
  const parsed = skillCoreFromMarkdown(text, core.path.slice(core.path.lastIndexOf('/') + 1));

  const executables = skipped.filter((s) => s.reason === 'executable').length;
  const warnings = [...parsed.warnings];
  if (executables > 0) {
    warnings.push(
      `${executables} executable file(s) in the archive were listed but not unpacked.`,
    );
  }

  return {
    name: parsed.name,
    description: parsed.description,
    type: parsed.type,
    source,
    body: parsed.body,
    files_used: [core.path],
    files_skipped: skipped,
    warnings,
  };
}

/**
 * Upload → preview, for either a bare `.md` or an archive. The caller decides
 * `source`; nothing here touches the database.
 */
export function previewFromUpload(
  filename: string,
  buf: Buffer,
  source: SkillImportPreview['source'],
): SkillImportPreview {
  const name = filename.trim() || 'skill.md';
  try {
    if (/\.(zip)$/i.test(name) || looksLikeZip(buf)) {
      return previewFromArchive(buf, source);
    }
    if (!MARKDOWN_RE.test(name)) {
      throw new ExtractError('Only a Markdown file (.md) or a .zip archive can be imported.');
    }
    const core = skillCoreFromMarkdown(buf.toString('utf8'), name);
    return {
      name: core.name,
      description: core.description,
      type: core.type,
      source,
      body: core.body,
      files_used: [name],
      files_skipped: [],
      warnings: core.warnings,
    };
  } catch (err) {
    if (err instanceof ArchiveError) throw new ExtractError(err.message);
    throw err;
  }
}
