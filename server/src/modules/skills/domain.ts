import { SkillType, type Skill } from '@devdigest/shared';
import { BadRequestError } from '../../platform/errors.js';
import {
  FALLBACK_SKILL_NAME,
  IMPORT_MAX_ENTRIES,
  IMPORT_MAX_ENTRY_BYTES,
  IMPORT_MAX_UPLOAD_BYTES,
  SKILL_NAME_MAX,
} from './constants.js';

/**
 * M2 — skill rules and the import rules. Pure functions only: no I/O, no clock.
 */

// ---- CRUD and versions ------------------------------------------------------

/** A partial change to a skill. Every field except `enabled` is content. */
export interface SkillPatch {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

/** The four fields a skill version records. */
export interface SkillContent {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

/** A skill as the review run loads it: one effective (linked + enabled) skill. */
export interface EffectiveSkill extends SkillContent {
  id: string;
  version: number;
}

/**
 * True when the patch changes any of name, description, type or body. Toggling
 * `enabled` or repeating stored values is not a content change and writes no
 * version.
 */
export function isContentChange(existing: SkillContent, patch: SkillPatch): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.type !== undefined && patch.type !== existing.type) ||
    (patch.body !== undefined && patch.body !== existing.body)
  );
}

/** The stored content with the patch's content fields applied. */
export function applyContent(existing: SkillContent, patch: SkillPatch): SkillContent {
  return {
    name: patch.name ?? existing.name,
    description: patch.description ?? existing.description,
    type: patch.type ?? existing.type,
    body: patch.body ?? existing.body,
  };
}

/** Note of the version a restore writes. */
export function restoreNote(version: number): string {
  return `Restored from v${version}`;
}

/** Restoring the version a skill is already at is refused (history stays linear). */
export function assertRestorable(skill: Pick<Skill, 'version'>, version: number): void {
  if (version === skill.version) {
    throw new BadRequestError('skill_version_current', `v${version} is already the current version`);
  }
}

// ---- Import: types ----------------------------------------------------------

/** One entry of an uploaded zip, as listed from its central directory. */
export interface ArchiveEntry {
  path: string;
  /** Uncompressed size declared by the archive (may lie; re-checked after inflating). */
  size: number;
  isDirectory: boolean;
}

/** Frontmatter split off a markdown file. `yaml` is null when there is none. */
export interface SplitMarkdown {
  yaml: string | null;
  body: string;
}

// ---- Import: limits and path safety -----------------------------------------

export type ImportKind = 'md' | 'zip';

/** `.md` or `.zip` by the file name; anything else is refused. */
export function importKind(filename: string): ImportKind {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.md')) return 'md';
  if (lower.endsWith('.zip')) return 'zip';
  throw new BadRequestError('import_unsupported_type', 'Upload a .md file or a .zip archive');
}

export function assertUploadSize(bytes: number): void {
  if (bytes > IMPORT_MAX_UPLOAD_BYTES) {
    throw new BadRequestError('import_too_large', 'The upload is larger than 1 MB');
  }
}

export function assertEntryCount(count: number): void {
  if (count > IMPORT_MAX_ENTRIES) {
    throw new BadRequestError(
      'import_too_many_entries',
      `The archive has ${count} entries; the limit is ${IMPORT_MAX_ENTRIES}`,
    );
  }
}

export function assertEntrySize(path: string, bytes: number): void {
  if (bytes > IMPORT_MAX_ENTRY_BYTES) {
    throw new BadRequestError('import_entry_too_large', `${path} is larger than 256 KB`);
  }
}

/** Absolute, `..`, a backslash or a drive letter: the path could escape the archive. */
export function isUnsafePath(path: string): boolean {
  return (
    path.startsWith('/') ||
    path.includes('\\') ||
    /^[a-zA-Z]:/.test(path) ||
    path.split('/').some((seg) => seg === '..')
  );
}

/** One unsafe entry rejects the whole upload; it is never skipped silently. */
export function assertSafePaths(entries: readonly ArchiveEntry[]): void {
  const bad = entries.find((e) => isUnsafePath(e.path));
  if (bad) throw new BadRequestError('import_unsafe_path', `Unsafe path in archive: ${bad.path}`);
}

// ---- Import: choosing the core file -----------------------------------------

/** macOS resource forks (`__MACOSX/`, `._x.md`) are metadata, never skill text. */
function isMacMetadata(path: string): boolean {
  return path.startsWith('__MACOSX/') || basename(path).startsWith('._');
}

/** A `.md` entry that may be decompressed. Every other entry is never inflated. */
export function isMarkdownEntry(entry: ArchiveEntry): boolean {
  return !entry.isDirectory && entry.path.toLowerCase().endsWith('.md') && !isMacMetadata(entry.path);
}

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

/**
 * The core file: `SKILL.md` (any case) at the root or inside one top-level
 * folder, else the archive's only `.md` file. None, or several `.md` files
 * without a `SKILL.md`, is refused.
 */
export function pickCoreFile(entries: readonly ArchiveEntry[]): ArchiveEntry {
  const md = entries.filter(isMarkdownEntry);
  const skillFiles = md
    .filter((e) => basename(e.path).toLowerCase() === 'skill.md' && e.path.split('/').length <= 2)
    .sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path));
  if (skillFiles[0]) return skillFiles[0];
  if (md.length === 1) return md[0]!;
  throw new BadRequestError(
    'import_no_skill_file',
    md.length === 0
      ? 'The archive contains no .md file'
      : 'The archive has several .md files and no SKILL.md',
  );
}

// ---- Import: frontmatter → fields -------------------------------------------

/** Split a leading `---` YAML block off a markdown file. */
export function splitFrontmatter(text: string): SplitMarkdown {
  const src = text.replace(/^﻿/, '');
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!match) return { yaml: null, body: src };
  return { yaml: match[1]!, body: src.slice(match[0].length) };
}

/** A kebab-case slug of at most 64 characters, or '' when nothing survives. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, SKILL_NAME_MAX)
    .replace(/-+$/, '');
}

/** File stem of a path (`dir/My Skill.md` → `My Skill`). */
export function fileStem(path: string): string {
  return basename(path).replace(/\.[^.]+$/, '');
}

/**
 * The name to fall back on when the frontmatter has none: the file stem, or —
 * for a `SKILL.md` core file — its folder, or the upload's own name.
 */
export function fallbackStem(corePath: string, uploadName: string): string {
  if (basename(corePath).toLowerCase() !== 'skill.md') return fileStem(corePath);
  const parts = corePath.split('/');
  return parts.length > 1 ? parts[parts.length - 2]! : fileStem(uploadName);
}

const KEPT_KEYS = new Set(['name', 'description', 'type']);

export interface MappedFields {
  name: string;
  description: string;
  type: SkillType;
  warnings: string[];
}

/**
 * Map parsed frontmatter onto the skill fields. `type` must be a `SkillType`
 * (else `custom` + warning); a missing name falls back to `stem` as a slug; a
 * missing description gives '' + warning; every other key is dropped with a
 * warning.
 */
export function mapFrontmatter(data: unknown, stem: string): MappedFields {
  const warnings: string[] = [];
  const fm: Record<string, unknown> =
    data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {};

  for (const key of Object.keys(fm)) {
    if (!KEPT_KEYS.has(key)) warnings.push(`Frontmatter key "${key}" is not supported and was dropped`);
  }

  let name = typeof fm.name === 'string' ? slugify(fm.name) : '';
  if (typeof fm.name === 'string' && name !== fm.name && name !== '') {
    warnings.push(`Name "${fm.name}" was changed to "${name}" (lowercase letters, digits and dashes)`);
  }
  if (!name) name = slugify(stem) || FALLBACK_SKILL_NAME;

  let description = typeof fm.description === 'string' ? fm.description.trim() : '';
  if (!description) {
    description = '';
    warnings.push('No description: add one before saving (it tells the model when the skill applies)');
  }

  let type: SkillType = 'custom';
  if (fm.type !== undefined) {
    const parsed = SkillType.safeParse(fm.type);
    if (parsed.success) type = parsed.data;
    else warnings.push(`Type "${String(fm.type)}" is not a skill type; using "custom"`);
  }

  return { name, description, type, warnings };
}
