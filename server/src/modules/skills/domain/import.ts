/**
 * Pure import rules (server/specs/03-skills.md Rules §6–§7): sanitize foreign
 * markdown, read its frontmatter, derive the skill candidate, and pick the ONE
 * markdown entry of an archive. No I/O: the archive reader and the fetcher
 * (infrastructure) hand in names, sizes and decoded text.
 */
import {
  SKILL_BODY_MAX,
  SKILL_DESCRIPTION_MAX,
  SkillType,
  type IgnoredImportFile,
} from '@devdigest/shared';
import { ValidationError } from '../../../platform/errors.js';
import {
  ARCHIVE_MAX_ENTRIES,
  ARCHIVE_MAX_MARKDOWN_BYTES,
  EXECUTABLE_DIRS,
  EXECUTABLE_EXTENSIONS,
  MARKDOWN_EXTENSIONS,
} from './constants.js';
import { slugifySkillName } from './skill.js';

/** 422 `invalid_import` with a human reason (the preview persists nothing). */
export function invalidImport(reason: string): ValidationError {
  return new ValidationError(reason, undefined, 'invalid_import');
}

// ---- sanitizer ----------------------------------------------------------------

const HTML_COMMENT_RE = /<!--[\s\S]*?(?:-->|$)/g;
/** Zero-width chars + BOM (hidden text / homoglyph tricks). */
const ZERO_WIDTH_RE = /[​-‍⁠﻿]/g;
/** Bidi controls (Trojan-Source style reordering). */
const BIDI_RE = /[؜‎‏‪-‮⁦-⁩]/g;

export interface Sanitized {
  text: string;
  warnings: string[];
}

/**
 * Remove what a human reviewer cannot see but the model would read: HTML
 * comments, zero-width and bidi control characters. Every removal is REPORTED
 * (the preview shows the warnings), never silent.
 */
export function sanitizeMarkdown(input: string): Sanitized {
  const warnings: string[] = [];
  let text = input.replace(/\r\n?/g, '\n');

  const comments = text.match(HTML_COMMENT_RE)?.length ?? 0;
  if (comments > 0) {
    text = text.replace(HTML_COMMENT_RE, '');
    warnings.push(`Removed ${comments} HTML comment(s) (hidden text)`);
  }
  const zeroWidth = text.match(ZERO_WIDTH_RE)?.length ?? 0;
  if (zeroWidth > 0) {
    text = text.replace(ZERO_WIDTH_RE, '');
    warnings.push(`Removed ${zeroWidth} zero-width character(s)`);
  }
  const bidi = text.match(BIDI_RE)?.length ?? 0;
  if (bidi > 0) {
    text = text.replace(BIDI_RE, '');
    warnings.push(`Removed ${bidi} bidi control character(s)`);
  }
  return { text, warnings };
}

// ---- frontmatter --------------------------------------------------------------

export interface Frontmatter {
  data: Record<string, string>;
  body: string;
}

/**
 * YAML-ish frontmatter: a leading `---` block of `key: value` lines. Only flat
 * string values are read (quotes stripped); anything else is ignored. No YAML
 * parser on purpose — foreign input gets the smallest possible surface.
 */
export function parseFrontmatter(text: string): Frontmatter {
  const match = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  if (!match) return { data: {}, body: text };
  const data: Record<string, string> = {};
  for (const line of match[1]!.split('\n')) {
    const kv = /^([A-Za-z][\w-]*)[ \t]*:[ \t]*(.*)$/.exec(line);
    if (!kv) continue;
    const value = kv[2]!.trim().replace(/^(['"])(.*)\1$/, '$2').trim();
    if (value) data[kv[1]!.toLowerCase()] = value;
  }
  return { data, body: text.slice(match[0].length) };
}

/** First prose paragraph (skips headings, fences, lists markers kept as text). */
export function firstParagraph(body: string): string {
  const paragraphs = body.split(/\n\s*\n/);
  for (const p of paragraphs) {
    const lines = p
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('```'));
    if (lines.length > 0) return lines.join(' ');
  }
  return '';
}

// ---- candidate ----------------------------------------------------------------

export interface SkillCandidate {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  warnings: string[];
}

/**
 * Markdown → the skill core shown in the preview. `fallbackName` (file or
 * folder name) is used when the frontmatter has no `name`; the description
 * falls back to the first paragraph. Throws `invalid_import` when no body is
 * left or it exceeds SKILL_BODY_MAX.
 */
export function skillFromMarkdown(markdown: string, fallbackName: string): SkillCandidate {
  const clean = sanitizeMarkdown(markdown);
  const warnings = [...clean.warnings];
  const { data, body: rawBody } = parseFrontmatter(clean.text);
  const body = rawBody.trim();
  if (!body) throw invalidImport('The skill has no body');
  if (body.length > SKILL_BODY_MAX) {
    throw invalidImport(`The skill body is ${body.length} chars; the limit is ${SKILL_BODY_MAX}`);
  }

  const name = slugifySkillName(data.name ?? fallbackName);
  if (data.name && name !== data.name) warnings.push(`Name normalized to "${name}"`);

  let description = (data.description ?? firstParagraph(body)).replace(/\s+/g, ' ').trim();
  if (description.length > SKILL_DESCRIPTION_MAX) {
    description = `${description.slice(0, SKILL_DESCRIPTION_MAX - 1).trimEnd()}…`;
    warnings.push(`Description shortened to ${SKILL_DESCRIPTION_MAX} chars`);
  }

  const parsedType = SkillType.safeParse(data.type);
  if (data.type && !parsedType.success) warnings.push(`Unknown type "${data.type}" — using "custom"`);
  const type = parsedType.success ? parsedType.data : 'custom';

  return { name, description, type, body, warnings };
}

// ---- file names ---------------------------------------------------------------

function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function isMarkdownName(path: string): boolean {
  return (MARKDOWN_EXTENSIONS as readonly string[]).includes(extOf(path));
}

export function isZipName(path: string): boolean {
  return extOf(path) === '.zip';
}

/** File-name stem (no folders, no extension). */
export function stemOf(path: string): string {
  const base = baseName(path);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

// ---- archive picker -------------------------------------------------------------

/** One archive entry as listed by the reader (content is NOT read). */
export interface ArchiveEntry {
  path: string;
  /** Uncompressed size from the archive directory. */
  size: number;
}

export interface ArchivePick {
  /** The ONE markdown entry that will be decoded. */
  chosen: string;
  /** Name to fall back on: SKILL.md → its folder (or the archive's stem); other .md → its stem. */
  fallbackName: string;
  ignored: IgnoredImportFile[];
}

/** OS metadata an archiver adds; dropped silently. */
function isNoise(path: string): boolean {
  return path.startsWith('__MACOSX/') || baseName(path) === '.DS_Store' || path.endsWith('/');
}

function ignoreReason(path: string): IgnoredImportFile['reason'] {
  const segments = path.split('/').slice(0, -1);
  if (segments.some((s) => (EXECUTABLE_DIRS as readonly string[]).includes(s.toLowerCase()))) return 'executable';
  if ((EXECUTABLE_EXTENSIONS as readonly string[]).includes(extOf(path))) return 'executable';
  if (isMarkdownName(path)) return 'reference_doc';
  return 'not_markdown';
}

/**
 * Choose the markdown entry of a skill archive (Rules §6–§7): `SKILL.md` at the
 * archive root (or inside its single top folder), else the single root `.md`.
 * Every other entry is listed with why it was not read. Throws `invalid_import`
 * on too many entries, no / ambiguous markdown, or an oversize markdown entry.
 */
export function pickArchiveEntry(entries: readonly ArchiveEntry[], archiveName: string): ArchivePick {
  if (entries.length > ARCHIVE_MAX_ENTRIES) {
    throw invalidImport(`The archive has ${entries.length} entries; the limit is ${ARCHIVE_MAX_ENTRIES}`);
  }
  const files = entries.filter((e) => !isNoise(e.path));
  if (files.length === 0) throw invalidImport('The archive is empty');

  // A single top folder (`my-skill/SKILL.md`, …) is treated as the root.
  const tops = new Set(files.map((f) => (f.path.includes('/') ? f.path.split('/')[0]! : '')));
  const topFolder = tops.size === 1 && !tops.has('') ? [...tops][0]! : null;
  const root = topFolder ? `${topFolder}/` : '';
  const atRoot = (e: ArchiveEntry) => e.path.startsWith(root) && !e.path.slice(root.length).includes('/');

  const skillMd = files.filter((e) => atRoot(e) && baseName(e.path).toLowerCase() === 'skill.md');
  const rootMd = files.filter((e) => atRoot(e) && isMarkdownName(e.path));
  const candidates = skillMd.length > 0 ? skillMd : rootMd;
  if (candidates.length === 0) throw invalidImport('The archive has no SKILL.md and no markdown file at its root');
  if (candidates.length > 1) {
    throw invalidImport(
      `The archive has ${candidates.length} candidate markdown files at its root; add a SKILL.md to choose one`,
    );
  }
  const chosen = candidates[0]!;
  if (chosen.size > ARCHIVE_MAX_MARKDOWN_BYTES) {
    throw invalidImport(`${chosen.path} is ${chosen.size} bytes; the limit is ${ARCHIVE_MAX_MARKDOWN_BYTES}`);
  }

  return {
    chosen: chosen.path,
    // SKILL.md is named by its folder; any other markdown by its own stem.
    fallbackName: skillMd.length > 0 ? (topFolder ?? stemOf(archiveName)) : stemOf(chosen.path),
    ignored: files.filter((e) => e !== chosen).map((e) => ({ path: e.path, reason: ignoreReason(e.path) })),
  };
}
