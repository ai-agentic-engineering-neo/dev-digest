import { unzipSync, strFromU8 } from 'fflate';
import type { Skill, SkillType } from '@devdigest/shared';
import { SKILL_NAME_RE } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import {
  ARCHIVE_ENTRY_LIMIT,
  MAX_BODY_BYTES,
  MAX_NAME_LENGTH,
  MAX_UPLOAD_BYTES,
  SKILL_MANIFEST_FILENAME,
} from './constants.js';

/**
 * Skills module helpers — DTO mapping, prompt rendering, import parsing.
 *
 * Pure functions only: no DB, no fs, no network. The import parsers in
 * particular are unit-tested without a container.
 */

/** The subset of a skill needed to render its prompt block. */
export interface RenderableSkill {
  name: string;
  type: SkillType;
  body: string;
}

/**
 * Render ONE skill as it appears inside the prompt's `## Skills / rules`
 * section.
 *
 * THIS IS THE ONLY RENDERER. Both the run executor (which injects the block)
 * and `GET /skills/:id/preview` (which shows the user what will be injected)
 * call it. If a second copy of this formatting ever appears, the Preview tab
 * silently starts lying about what the model actually receives — so import
 * this function rather than re-deriving the heading anywhere.
 *
 * The `### Skill: <name>` heading is load-bearing: plain concatenation makes
 * four skills read as one undifferentiated wall of instructions, and the name
 * is what the model cites back and what the run log asserts on.
 */
export function renderSkillBlock(skill: RenderableSkill): string {
  return `### Skill: ${skill.name} (${skill.type})\n${skill.body.trim()}`;
}

/** Row → API DTO. `evidence_files` stays null until the Conventions extractor. */
export function toSkillDto(row: {
  id: string;
  name: string;
  description: string;
  type: SkillType;
  source: Skill['source'];
  body: string;
  enabled: boolean;
  version: number;
  evidenceFiles: string[] | null;
}): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    source: row.source,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles,
  };
}

/** True when a patch actually changes the body — the ONLY thing that mints a
 *  version. Renaming a skill or rewording its description does not. */
export function isBodyChange(existing: { body: string }, patch: { body?: string }): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}

// ---------------------------------------------------------------- import ----
//
// Everything below parses an UPLOAD. It is deliberately pure — no fs, no
// network, no unzip-to-disk — so `skills-import.test.ts` can cover the security
// guards without a container or a database.
//
// Trust model (specs/02): a skill is instructions, not data. We cannot sandbox
// text; the only protection is that the user reads it first. So the parser's
// job is narrow and paranoid: read exactly ONE markdown file, never execute or
// even decompress anything else, and refuse anything that smells like a path
// traversal or a zip bomb.

/** One parsed `SKILL.md` — the fields an import preview is built from. */
export interface ParsedSkillFile {
  name: string;
  description: string;
  body: string;
}

/** What `extractSkillFromZip` learned about an archive, beyond the body. */
export interface ExtractedArchiveSkill extends ParsedSkillFile {
  /** Which entry the body came from. */
  source_path: string;
  /** How many other entries the archive held. NONE of them were read. */
  ignored_entries: number;
  /** All `SKILL.md` matches, when there was more than one; the user picks. */
  candidates?: string[];
}

/** Byte length of a string as UTF-8 — `.length` counts UTF-16 units, not bytes. */
function utf8Bytes(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

/**
 * Turn arbitrary text into a skill slug (`^[a-z0-9][a-z0-9-]*$`, ≤ 64 chars).
 * Returns `''` when nothing usable survives, so callers can fall back.
 */
export function slugifySkillName(input: string): string {
  const slug = input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_NAME_LENGTH)
    .replace(/-+$/g, '');
  return SKILL_NAME_RE.test(slug) ? slug : '';
}

/**
 * Split optional YAML frontmatter off the top of a markdown document.
 *
 * Intentionally NOT a YAML parser: this reads the flat `key: value` pairs the
 * `SKILL.md` convention uses (see the repo's own `.claude/skills` directory)
 * and ignores everything else. A frontmatter block is only recognised when the very first
 * line is `---` and a closing `---` follows; otherwise the whole document is
 * body. Nothing in here is evaluated — pulling in a full YAML engine to parse
 * two strings from an untrusted upload would be a strictly worse trade.
 */
export function parseFrontmatter(text: string): {
  data: Record<string, string>;
  body: string;
} {
  const normalized = text.replace(/^\ufeff/, '');
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(normalized);
  if (!match) return { data: {}, body: normalized };

  const data: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const pair = /^([A-Za-z_][A-Za-z0-9_-]*)[ \t]*:[ \t]*(.*)$/.exec(line);
    if (!pair) continue; // nested/list YAML — not part of the convention
    let value = pair[2]!.trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    data[pair[1]!] = value;
  }
  return { data, body: normalized.slice(match[0].length) };
}

/** First `# ATX heading` of a markdown document, or `''`. */
function firstHeading(body: string): string {
  return /^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/m.exec(body)?.[1]?.trim() ?? '';
}

/** First non-heading, non-blank paragraph — the description fallback. */
function firstParagraph(body: string): string {
  const lines = body.split(/\r?\n/);
  const buffer: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      if (buffer.length > 0) break;
      continue;
    }
    if (/^#{1,6}[ \t]/.test(trimmed)) {
      if (buffer.length > 0) break;
      continue; // skip the title heading and keep looking
    }
    buffer.push(trimmed);
  }
  return buffer.join(' ');
}

/**
 * Parse an uploaded `.md` into the fields a `SkillImportPreview` needs.
 *
 * Name resolution, in order: frontmatter `name` → first `#` heading → the
 * uploaded filename. Description: frontmatter `description` → first paragraph.
 * Body is everything after the frontmatter, verbatim — we never rewrite a
 * stranger's instructions, we only show them.
 */
export function parseSkillMarkdown(
  text: string,
  opts: { filename?: string } = {},
): ParsedSkillFile {
  const { data, body } = parseFrontmatter(text);
  const trimmedBody = body.replace(/^\r?\n+/, '').trimEnd();

  if (utf8Bytes(trimmedBody) > MAX_BODY_BYTES) {
    throw new ValidationError(
      `Skill body is larger than ${MAX_BODY_BYTES} bytes; a skill is prompt text, not a file`,
    );
  }

  const basename = (opts.filename ?? '').split('/').pop() ?? '';
  const name =
    slugifySkillName(data.name ?? '') ||
    slugifySkillName(firstHeading(trimmedBody)) ||
    slugifySkillName(basename.replace(/\.(md|markdown)$/i, ''));
  if (!name) {
    throw new ValidationError(
      'Could not derive a skill name — add YAML frontmatter with `name:` or a `# Heading`',
    );
  }

  const description = (data.description ?? '').trim() || firstParagraph(trimmedBody);
  return { name, description, body: trimmedBody };
}

/**
 * Matches `SKILL.md` at any depth in the archive — in practice, any entry
 * whose basename is `SKILL.md`. The depth is left open on purpose: a GitHub
 * zipball nests everything under `<repo>-<ref>/`, so a stricter pattern would
 * reject the most common archive shape a user actually has.
 */
function isSkillManifestPath(path: string): boolean {
  return (path.split('/').pop() ?? '') === SKILL_MANIFEST_FILENAME;
}

/** Absolute path, drive letter, or any `..` segment — all refused outright. */
function isUnsafeEntryPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  if (normalized.startsWith('/')) return true;
  if (/^[A-Za-z]:\//.test(normalized)) return true;
  return normalized.split('/').includes('..');
}

/**
 * Read ONE `SKILL.md` out of a `.zip` and ignore every other entry.
 *
 * The `filter` callback is what makes "ignore" literal: fflate only inflates
 * entries it returns true for, so an `install.sh` sitting next to the manifest
 * is never decompressed, never parsed, and obviously never run. We still see
 * its NAME (that is how `ignored_entries` is counted and how traversal is
 * detected) — names come from the archive index, not from its contents.
 */
export function extractSkillFromZip(bytes: Uint8Array): ExtractedArchiveSkill {
  const names: string[] = [];
  let oversizeManifest = false;

  const files = unzipSync(bytes, {
    filter: (file) => {
      names.push(file.name);
      // Guards are enforced after the pass (we need the full name list to
      // report them), but stop inflating the moment the archive looks abusive.
      if (names.length > ARCHIVE_ENTRY_LIMIT) return false;
      if (!isSkillManifestPath(file.name)) return false;
      if (file.originalSize > MAX_BODY_BYTES) {
        oversizeManifest = true;
        return false;
      }
      return true;
    },
  });

  if (names.length > ARCHIVE_ENTRY_LIMIT) {
    throw new ValidationError(
      `Archive has more than ${ARCHIVE_ENTRY_LIMIT} entries; refusing to read it`,
    );
  }
  const unsafe = names.find(isUnsafeEntryPath);
  if (unsafe) {
    throw new ValidationError(`Archive contains an unsafe entry path: ${unsafe}`);
  }
  if (oversizeManifest) {
    throw new ValidationError(`SKILL.md is larger than ${MAX_BODY_BYTES} bytes`);
  }

  const candidates = names.filter(isSkillManifestPath);
  const sourcePath = candidates[0];
  if (!sourcePath) {
    throw new ValidationError('No SKILL.md found in the archive');
  }

  const parsed = parseSkillMarkdown(strFromU8(files[sourcePath]!), {
    filename: sourcePath,
  });
  return {
    ...parsed,
    source_path: sourcePath,
    // Everything that is not the one entry we read. Directory records count:
    // the number is "how much of this archive did we deliberately not look at".
    ignored_entries: names.length - 1,
    ...(candidates.length > 1 ? { candidates } : {}),
  };
}

/**
 * Parse an upload (`.md` or `.zip`) into everything a `SkillImportPreview`
 * needs except `collides_with`, which requires a workspace lookup and is filled
 * in by the service. NOTHING here touches the database.
 */
export function parseSkillUpload(
  filename: string,
  bytes: Uint8Array,
): ParsedSkillFile & { source_path: string | null; ignored_entries: number; candidates?: string[] } {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ValidationError(`Upload is larger than ${MAX_UPLOAD_BYTES} bytes`);
  }
  if (/\.zip$/i.test(filename)) {
    return extractSkillFromZip(bytes);
  }
  if (/\.(md|markdown)$/i.test(filename)) {
    return {
      ...parseSkillMarkdown(strFromU8(bytes), { filename }),
      source_path: null,
      ignored_entries: 0,
    };
  }
  throw new ValidationError(`Unsupported file type: ${filename} (expected .md or .zip)`);
}
