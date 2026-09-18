import type { SkillImportPreview } from '@devdigest/shared';
import { unzipSync, strFromU8 } from 'fflate';
import {
  IMPORT_EXTENSIONS,
  MAX_ARCHIVE_BYTES,
  MAX_SKILL_MD_BYTES,
} from './constants.js';

export type { SkillImportPreview };

/** HTTP 400 — zip-slip, oversize, bad type, or missing SKILL.md. Not ValidationError (422). */
export class SkillImportError extends Error {
  readonly statusCode = 400 as const;
  readonly code = 'skill_import_error';
  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'SkillImportError';
  }
}

const FRONTMATTER_OPEN = /^---\r?\n/;
const FRONTMATTER_CLOSE = /\r?\n---\r?\n/;
const HEADING = /^#\s+(.+)$/m;

/**
 * Optional YAML frontmatter `name` / `description` only; remainder is `body`.
 * Missing frontmatter: first ATX heading becomes `name`, description stays empty.
 */
export function parseMarkdownSkill(text: string): SkillImportPreview {
  const stripped = text.replace(/^\uFEFF/, '');
  let name = '';
  let description = '';
  let body = stripped;

  if (FRONTMATTER_OPEN.test(stripped)) {
    const close = stripped.search(FRONTMATTER_CLOSE);
    if (close !== -1) {
      const matter = stripped.slice(stripped.indexOf('\n') + 1, close);
      const rest = stripped.slice(close).replace(FRONTMATTER_CLOSE, '');
      ({ name, description } = parseFrontmatter(matter));
      body = rest.replace(/^\r?\n/, '');
    }
  }

  body = body.trimEnd();
  if (!name) {
    const m = HEADING.exec(body);
    if (m) name = m[1]!.trim();
  }

  return { name, description, body };
}

function parseFrontmatter(matter: string): { name: string; description: string } {
  let name = '';
  let description = '';
  for (const line of matter.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colon = trimmed.indexOf(':');
    if (colon < 1) continue;
    const key = trimmed.slice(0, colon).trim();
    const raw = trimmed.slice(colon + 1);
    if (raw.trim().startsWith('!!')) {
      throw new SkillImportError('YAML tags are not allowed in skill frontmatter');
    }
    if (key === 'name') name = yamlScalar(raw);
    else if (key === 'description') description = yamlScalar(raw);
  }
  return { name, description };
}

function yamlScalar(raw: string): string {
  const t = raw.trim();
  if (
    (t.startsWith('"') && t.endsWith('"') && t.length >= 2) ||
    (t.startsWith("'") && t.endsWith("'") && t.length >= 2)
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function isUnsafeZipPath(name: string): boolean {
  if (name.includes('\\')) return true;
  if (name.startsWith('/')) return true;
  if (/^[a-zA-Z]:/.test(name)) return true;
  return name.split('/').some((p) => p === '..');
}

function isRootSkillMd(name: string): boolean {
  return name === 'SKILL.md' || name === './SKILL.md';
}

/** Nested Agent Skills layout: one directory segment, then SKILL.md. */
function isNestedSkillMd(name: string): boolean {
  const parts = name.split('/');
  return parts.length === 2 && parts[0] !== '' && parts[0] !== '.' && parts[1] === 'SKILL.md';
}

/**
 * Read only SKILL.md at zip root, or one nested SKILL.md if root is absent.
 * Any traversal / absolute / backslash path rejects the whole archive.
 */
export function readSkillMdFromZip(bytes: Uint8Array): string {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new SkillImportError('Archive exceeds size limit', { max: MAX_ARCHIVE_BYTES });
  }

  let slip = false;
  let oversize = false;
  const extracted = unzipSync(bytes, {
    filter(file) {
      if (isUnsafeZipPath(file.name)) {
        slip = true;
        return false;
      }
      const wanted = isRootSkillMd(file.name) || isNestedSkillMd(file.name);
      if (wanted && file.originalSize > MAX_SKILL_MD_BYTES) {
        oversize = true;
        return false;
      }
      return wanted;
    },
  });

  if (slip) throw new SkillImportError('Archive contains an unsafe path');
  if (oversize) {
    throw new SkillImportError('SKILL.md exceeds size limit', { max: MAX_SKILL_MD_BYTES });
  }

  const names = Object.keys(extracted);
  const root = names.find(isRootSkillMd);
  const nested = names.filter(isNestedSkillMd);
  const chosen = root ?? (nested.length === 1 ? nested[0] : undefined);
  if (!chosen) {
    throw new SkillImportError(
      nested.length > 1 ? 'Archive contains multiple SKILL.md files' : 'Archive has no SKILL.md',
    );
  }

  const raw = extracted[chosen]!;
  if (raw.byteLength > MAX_SKILL_MD_BYTES) {
    throw new SkillImportError('SKILL.md exceeds size limit', { max: MAX_SKILL_MD_BYTES });
  }
  return strFromU8(raw);
}

function importExtension(filename: string): (typeof IMPORT_EXTENSIONS)[number] | null {
  const base = (filename.split(/[/\\]/).pop() ?? filename).toLowerCase();
  const match = IMPORT_EXTENSIONS.find((ext) => base.endsWith(ext));
  return match ?? null;
}

export function parseImportedSkill(filename: string, bytes: Uint8Array): SkillImportPreview {
  const ext = importExtension(filename);
  if (!ext) {
    throw new SkillImportError('Unsupported file type', { filename });
  }

  let markdown: string;
  if (ext === '.md') {
    if (bytes.byteLength > MAX_SKILL_MD_BYTES) {
      throw new SkillImportError('Markdown exceeds size limit', { max: MAX_SKILL_MD_BYTES });
    }
    markdown = strFromU8(bytes);
  } else {
    try {
      markdown = readSkillMdFromZip(bytes);
    } catch (err) {
      if (err instanceof SkillImportError) throw err;
      throw new SkillImportError('Archive could not be read');
    }
  }

  const preview = parseMarkdownSkill(markdown);
  if (!preview.body.trim()) {
    throw new SkillImportError('Skill body is empty');
  }
  return preview;
}
