import { unzipSync } from 'fflate';
import type { Skill, SkillImportPreview, SkillSource, SkillSummary, SkillType, SkillVersion } from '@devdigest/shared';
import { SkillType as SkillTypeSchema } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import {
  EXECUTABLE_EXTENSIONS,
  MAX_IMPORT_DESCRIPTION_LENGTH,
  MAX_IMPORT_MARKDOWN_BYTES,
  MAX_ZIP_MEMBERS,
  MAX_ZIP_UNCOMPRESSED_BYTES,
} from './constants.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping, the
 * version-bump predicate, slugification, frontmatter parsing and archive
 * import parsing. No I/O: `fflate`'s `unzipSync` is a synchronous in-memory
 * transform (no filesystem, no network), which is what keeps the "a skill
 * import never touches disk" property structural rather than a rule someone
 * has to follow (specs/02-skills.md §7.4).
 */

// ---- DTO mapping ------------------------------------------------------------

/** Map a persisted skill row + its real token cost to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow, tokenEstimate: number): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? undefined,
    token_estimate: tokenEstimate,
  };
}

/** Map a skill row to the rail's `SkillSummary` (adds the `used_by` link count). */
export function toSkillSummaryDto(row: SkillRow, tokenEstimate: number, usedBy: number): SkillSummary {
  return { ...toSkillDto(row, tokenEstimate), used_by: usedBy };
}

/** Map a `skill_versions` row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    message: row.message,
    created_at: row.createdAt.toISOString(),
  };
}

// ---- Version-bump predicate (§5.2) ------------------------------------------

/** Fields whose change bumps a skill's version. Toggling `enabled` bumps neither. */
export interface SkillConfigPatch {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
}

/**
 * True when a patch changes `name`/`description`/`type`/`body` relative to the
 * existing row — a config change bumps `skills.version` and inserts a
 * `skill_versions` row. Toggling `enabled` alone must NOT trigger this.
 */
export function isSkillConfigChange(
  existing: Pick<SkillRow, 'name' | 'description' | 'type' | 'body'>,
  patch: SkillConfigPatch,
): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.type !== undefined && patch.type !== existing.type) ||
    (patch.body !== undefined && patch.body !== existing.body)
  );
}

/** "Restore" always writes the old body forward as a new version with this label. */
export function restoreMessage(version: number): string {
  return `Restored from v${version}`;
}

// ---- Stats arithmetic (§7.2) -------------------------------------------------

/** Divide-safe ratio: `null` when the denominator is zero — never a synthetic 0. */
export function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export interface FindingWindowRow {
  category: string;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}

export interface FindingsAggregate {
  findings: number;
  accepted: number;
  settled: number;
  by_category: { category: string; count: number }[];
}

/** Roll up a window of finding rows into the counts `SkillStats` needs. */
export function aggregateFindingRows(rows: FindingWindowRow[]): FindingsAggregate {
  let accepted = 0;
  let settled = 0;
  const byCategory = new Map<string, number>();
  for (const row of rows) {
    if (row.acceptedAt) accepted += 1;
    if (row.acceptedAt || row.dismissedAt) settled += 1;
    byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + 1);
  }
  return {
    findings: rows.length,
    accepted,
    settled,
    by_category: [...byCategory.entries()].map(([category, count]) => ({ category, count })),
  };
}

// ---- Slugification (D3) ------------------------------------------------------

/** Slugify to the D3 pattern `^[a-z0-9][a-z0-9-]{1,63}$`; never returns an invalid slug. */
export function slugify(input: string): string {
  const ascii = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  let slug = ascii
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length > 64) slug = slug.replace(/-+$/, '').slice(0, 64).replace(/-+$/, '');
  if (slug.length < 2) slug = 'skill';
  return slug;
}

/** Append `-2`, `-3`, … until `base` no longer collides with `existingNames`. */
export function dedupeSlug(base: string, existingNames: ReadonlySet<string>): string {
  if (!existingNames.has(base)) return base;
  for (let i = 2; i < 100_000; i++) {
    const suffix = `-${i}`;
    const maxBaseLen = 64 - suffix.length;
    const truncated = base.length > maxBaseLen ? base.slice(0, maxBaseLen) : base;
    const candidate = `${truncated}${suffix}`;
    if (!existingNames.has(candidate)) return candidate;
  }
  // Practically unreachable (100k collisions on one workspace) — keep this total.
  return `${base.slice(0, 32)}-${Date.now()}`;
}

// ---- Frontmatter parsing (§7.4) ----------------------------------------------

export interface ParsedFrontmatter {
  data: Record<string, string>;
  body: string;
}

/**
 * A leading `---` block of flat `key: value` scalar lines, BOM-tolerant. No
 * YAML dependency: a nested mapping (`key:` with no scalar value) is skipped,
 * never guessed at. An unterminated block (opening `---` with no matching
 * close) is treated as malformed — no frontmatter, the whole text is the body.
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const lines = text.split(/\r\n|\n/);
  if ((lines[0] ?? '').trim() !== '---') {
    return { data: {}, body: text };
  }
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() === '---') {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) {
    return { data: {}, body: text };
  }
  const data: Record<string, string> = {};
  for (let i = 1; i < closeIdx; i++) {
    const line = lines[i] ?? '';
    if (line.trim() === '') continue;
    const match = /^([^\s:][^:]*):[ \t]?(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1]!.trim().toLowerCase();
    let value = (match[2] ?? '').trim();
    if (value === '') continue; // `key:` with nothing after → nested mapping, skip.
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  const body = lines.slice(closeIdx + 1).join('\n');
  return { data, body };
}

/** First `# ` heading in a markdown document, if any. */
export function firstHeading(markdown: string): string | undefined {
  for (const line of markdown.split(/\r\n|\n/)) {
    const match = /^#\s+(.+)$/.exec(line.trim());
    if (match) return match[1]!.trim();
  }
  return undefined;
}

/** First non-heading paragraph, whitespace-collapsed and capped at `maxLen`. */
export function firstParagraph(markdown: string, maxLen: number): string {
  const blocks = markdown.split(/\n\s*\n/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed || /^#{1,6}\s/.test(trimmed)) continue;
    const text = trimmed.replace(/\s+/g, ' ').trim();
    if (text) return text.length > maxLen ? text.slice(0, maxLen) : text;
  }
  return '';
}

/** The filename without its directory or extension — the last-resort `name` source. */
export function filenameStem(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/** The last path segment (zip entries always use `/`). */
export function basenameOf(path: string): string {
  return path.split('/').pop() ?? path;
}

/** Number of directory separators — used to find the "shallowest" markdown file. */
export function pathDepth(path: string): number {
  return path.split('/').length - 1;
}

/** True when `path`'s extension looks like something that could execute. */
export function isExecutableExtension(path: string): boolean {
  const lower = path.toLowerCase();
  return EXECUTABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * `.md` → `SkillImportPreview`. `name` <- frontmatter.name ?? first `# ` heading
 * ?? filename stem, slugified and de-duplicated against the workspace's existing
 * names so confirming the preview never 409s. `type` <- frontmatter.type when it
 * parses as `SkillType`, else `'custom'`.
 */
export function parseMarkdownImport(
  filename: string,
  content: string,
  existingNames: ReadonlySet<string>,
): SkillImportPreview {
  const { data, body } = parseFrontmatter(content);
  const rawName = data.name || firstHeading(body) || filenameStem(filename);
  const name = dedupeSlug(slugify(rawName), existingNames);
  const description = (data.description || firstParagraph(body, MAX_IMPORT_DESCRIPTION_LENGTH)).slice(
    0,
    MAX_IMPORT_DESCRIPTION_LENGTH,
  );
  const type: SkillType =
    data.type && SkillTypeSchema.safeParse(data.type).success ? (data.type as SkillType) : 'custom';
  return {
    name,
    description,
    type,
    body: body.trim(),
    source: 'imported_file',
    ignored_entries: [],
    warnings: [],
  };
}

// ---- Archive import (§7.4) ---------------------------------------------------

interface ZipMember {
  path: string;
  bytes: Uint8Array;
}

function listZipMembers(buffer: Buffer): ZipMember[] {
  const files = unzipSync(new Uint8Array(buffer));
  return Object.entries(files)
    .filter(([path]) => !path.endsWith('/'))
    .map(([path, bytes]) => ({ path, bytes }));
}

function pickShallowestThenAlpha(candidates: ZipMember[]): ZipMember | undefined {
  if (candidates.length === 0) return undefined;
  return [...candidates].sort((a, b) => {
    const depthDiff = pathDepth(a.path) - pathDepth(b.path);
    return depthDiff !== 0 ? depthDiff : a.path.localeCompare(b.path);
  })[0];
}

interface CoreSelection {
  core?: ZipMember;
  otherPaths: string[];
}

/**
 * Core file selection (§7.4): `SKILL.md`, else `README.md`, else the shallowest
 * single `*.md` — ties break on path depth then alphabetically, so the same
 * archive always yields the same skill.
 */
function selectCoreMember(members: ZipMember[]): CoreSelection {
  const mdMembers = members.filter((m) => m.path.toLowerCase().endsWith('.md'));
  const skillMd = pickShallowestThenAlpha(mdMembers.filter((m) => basenameOf(m.path) === 'SKILL.md'));
  const readmeMd =
    skillMd ?? pickShallowestThenAlpha(mdMembers.filter((m) => basenameOf(m.path) === 'README.md'));
  const core = skillMd ?? readmeMd ?? pickShallowestThenAlpha(mdMembers);
  const otherPaths = members.filter((m) => m !== core).map((m) => m.path);
  return { core, otherPaths };
}

/**
 * `.zip` → `SkillImportPreview`. Unzipped in memory only (`fflate.unzipSync`,
 * sync + dependency-free + no extract-to-disk API): nothing but text ever
 * leaves this function, so zip-slip has no surface to exploit.
 */
export function parseZipImport(
  filename: string,
  buffer: Buffer,
  existingNames: ReadonlySet<string>,
): SkillImportPreview {
  const members = listZipMembers(buffer);
  if (members.length > MAX_ZIP_MEMBERS) {
    throw new ValidationError(`Archive has too many entries (max ${MAX_ZIP_MEMBERS})`);
  }
  const totalBytes = members.reduce((sum, m) => sum + m.bytes.byteLength, 0);
  if (totalBytes > MAX_ZIP_UNCOMPRESSED_BYTES) {
    throw new ValidationError(
      `Archive exceeds the ${Math.round(MAX_ZIP_UNCOMPRESSED_BYTES / (1024 * 1024))}MB uncompressed limit`,
    );
  }

  const { core, otherPaths } = selectCoreMember(members);
  if (!core) {
    throw new ValidationError(
      'No markdown file (SKILL.md, README.md or *.md) found in the archive',
      { contained: members.map((m) => m.path) },
    );
  }
  if (core.bytes.byteLength > MAX_IMPORT_MARKDOWN_BYTES) {
    throw new ValidationError(
      `${core.path} exceeds the ${Math.round(MAX_IMPORT_MARKDOWN_BYTES / 1024)}KB markdown limit`,
    );
  }

  const warnings = members
    .filter((m) => m !== core && isExecutableExtension(m.path))
    .map((m) => `${m.path}: not imported, never run`);

  const content = Buffer.from(core.bytes).toString('utf8');
  const preview = parseMarkdownImport(basenameOf(core.path), content, existingNames);
  return { ...preview, ignored_entries: otherPaths, warnings };
}

/** Decode + size-cap an upload BEFORE any parsing starts (§7.4). */
export function decodeBase64Capped(base64: string, maxBytes: number): Buffer {
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > maxBytes) {
    throw new ValidationError(`Upload exceeds the ${Math.round(maxBytes / 1024)}KB decoded limit`);
  }
  return buffer;
}

/** Dispatch a decoded upload to the `.md` or `.zip` parser by filename extension. */
export function importPreviewFromUpload(
  filename: string,
  buffer: Buffer,
  existingNames: ReadonlySet<string>,
): SkillImportPreview {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.zip')) return parseZipImport(filename, buffer, existingNames);
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return parseMarkdownImport(filename, buffer.toString('utf8'), existingNames);
  }
  throw new ValidationError(`Unsupported import file type: ${filename} (expected .md or .zip)`);
}
