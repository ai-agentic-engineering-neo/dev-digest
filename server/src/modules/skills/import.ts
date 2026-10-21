/**
 * skills — import parser (ring 2, pure).
 *
 * Turns an uploaded Markdown file or a zip archive into a `SkillImportPreview`:
 * the skill's core (one Markdown document) plus the list of archive entries
 * that were deliberately NOT opened. Nothing here executes, evaluates, or even
 * decodes anything but the one Markdown file; scripts and binaries are listed
 * by name only. The caller shows the preview and saves only on confirmation.
 */
import { unzipSync } from 'fflate';
import { ValidationError } from '../../platform/errors.js';
import {
  ARCHIVE_EXTENSIONS,
  CORE_FILE_NAMES,
  EXECUTABLE_EXTENSIONS,
  MARKDOWN_EXTENSIONS,
  MAX_BODY_CHARS,
  MAX_DERIVED_DESCRIPTION_CHARS,
  MAX_IMPORT_BYTES,
  MAX_NAME_CHARS,
  SKILL_TYPES,
} from './constants.js';
import { isValidSkillName } from './helpers.js';
import type { SkillImportPreview } from './ports.js';

const extensionOf = (name: string): string => {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i).toLowerCase();
};
const basenameOf = (path: string): string => path.split('/').pop() ?? path;
const hasExt = (name: string, exts: readonly string[]): boolean => exts.includes(extensionOf(name));

/** `Test Quality  Gate!` → `test-quality-gate`; clipped to MAX_NAME_CHARS. */
export function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_NAME_CHARS)
    .replace(/-+$/g, '');
}

interface Frontmatter {
  fields: Record<string, string>;
  body: string;
}

/** Split a leading `---` YAML block (flat `key: value` lines only) from the body. */
export function splitFrontmatter(text: string): Frontmatter {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { fields: {}, body: text };
  const fields: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (kv) fields[kv[1]!.toLowerCase()] = kv[2]!.trim().replace(/^["']|["']$/g, '');
  }
  return { fields, body: text.slice(m[0].length) };
}

/**
 * Build the preview from one Markdown document. Name comes from frontmatter,
 * else the first `# heading`, else the file name; description from frontmatter,
 * else the first paragraph; type from frontmatter when valid, else `custom`.
 */
export function parseMarkdownSkill(
  text: string,
  fallbackName: string,
  sourceFile: string,
  ignoredFiles: string[] = [],
): SkillImportPreview {
  const warnings: string[] = [];
  const { fields, body: rawBody } = splitFrontmatter(text.replace(/^\uFEFF/, ''));
  const body = rawBody.trim();
  if (!body) throw new ValidationError('The skill file has no Markdown body');
  if (body.length > MAX_BODY_CHARS) {
    throw new ValidationError(`Skill body exceeds ${MAX_BODY_CHARS} characters`, { length: body.length });
  }

  const heading = /^#\s+(.+?)\s*$/m.exec(body)?.[1];
  let name = fields.name ? slugify(fields.name) : '';
  if (!name && heading) {
    name = slugify(heading);
    if (name) warnings.push(`Name derived from the first heading ("${heading}").`);
  }
  if (!name) {
    name = slugify(fallbackName);
    if (name) warnings.push(`Name derived from the file name ("${fallbackName}").`);
  }
  if (!name || !isValidSkillName(name)) {
    name = 'imported-skill';
    warnings.push('Could not derive a valid name; edit it before saving.');
  }

  let description = fields.description ?? '';
  if (!description) {
    const paragraph = body
      .split(/\r?\n\s*\r?\n/)
      .map((p) => p.trim())
      .find((p) => p && !p.startsWith('#') && !p.startsWith('```'));
    if (paragraph) {
      description = paragraph.replace(/\s+/g, ' ').slice(0, MAX_DERIVED_DESCRIPTION_CHARS);
      warnings.push('Description derived from the first paragraph; rewrite it as a directive.');
    }
  }

  const typeField = fields.type?.toLowerCase();
  const type = (SKILL_TYPES as readonly string[]).includes(typeField ?? '')
    ? (typeField as SkillImportPreview['type'])
    : 'custom';
  if (typeField && type === 'custom' && typeField !== 'custom') {
    warnings.push(`Unknown type "${typeField}" in frontmatter; set to custom.`);
  }

  const executables = ignoredFiles.filter((f) => hasExt(f, EXECUTABLE_EXTENSIONS) || /(^|\/)scripts\//.test(f));
  if (executables.length > 0) {
    warnings.push(`${executables.length} executable file(s) in the archive were listed but never opened or run.`);
  }
  if (ignoredFiles.length > executables.length) {
    warnings.push(`${ignoredFiles.length - executables.length} other file(s) in the archive were not imported; only the skill core is.`);
  }

  return { name, description, type, body, source_file: sourceFile, ignored_files: ignoredFiles, warnings };
}

/** Pick the archive entry that holds the skill core: SKILL.md, then README.md, then the shallowest .md. */
export function pickCoreEntry(paths: string[]): string | undefined {
  const md = paths.filter((p) => hasExt(p, MARKDOWN_EXTENSIONS));
  const depth = (p: string) => p.split('/').length;
  for (const preferred of CORE_FILE_NAMES) {
    const hits = md.filter((p) => basenameOf(p).toLowerCase() === preferred).sort((a, b) => depth(a) - depth(b));
    if (hits[0]) return hits[0];
  }
  return [...md].sort((a, b) => depth(a) - depth(b) || a.localeCompare(b))[0];
}

/**
 * Entry point: `filename` decides the parser. Bytes are the decoded upload.
 * Throws `ValidationError` for unsupported, oversized or empty inputs.
 */
export function extractSkillFromUpload(filename: string, bytes: Uint8Array): SkillImportPreview {
  if (bytes.byteLength === 0) throw new ValidationError('The uploaded file is empty');
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    throw new ValidationError(`Upload exceeds ${MAX_IMPORT_BYTES} bytes`, { bytes: bytes.byteLength });
  }
  const stem = basenameOf(filename).replace(/\.[^.]+$/, '');

  if (hasExt(filename, MARKDOWN_EXTENSIONS)) {
    return parseMarkdownSkill(new TextDecoder('utf-8').decode(bytes), stem, basenameOf(filename));
  }

  if (hasExt(filename, ARCHIVE_EXTENSIONS)) {
    // The filter sees every entry's name and declared size BEFORE inflation.
    // Only Markdown entries within the size cap are inflated; scripts, binaries
    // and oversized files are recorded by name and never decompressed, so a
    // zip bomb cannot expand in memory and a script cannot be read, let alone run.
    const listed: string[] = [];
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(bytes, {
        filter: (f) => {
          if (f.name.endsWith('/')) return false;
          listed.push(f.name);
          return hasExt(f.name, MARKDOWN_EXTENSIONS) && f.originalSize <= MAX_IMPORT_BYTES;
        },
      });
    } catch {
      throw new ValidationError('The archive could not be read as a zip file');
    }
    const paths = listed.filter((p) => !/(^|\/)(__MACOSX|\.git)\//.test(p) && !basenameOf(p).startsWith('.'));
    const core = pickCoreEntry(paths.filter((p) => p in entries));
    if (!core) throw new ValidationError('No Markdown skill file (SKILL.md / README.md / *.md) found in the archive');
    const ignored = paths.filter((p) => p !== core).sort();
    const text = new TextDecoder('utf-8').decode(entries[core]!);
    const fallback = basenameOf(core).replace(/\.[^.]+$/, '');
    // A folder-named archive (`my-skill/SKILL.md`) names the skill after the folder.
    const folder = core.includes('/') ? core.split('/').slice(-2, -1)[0] : undefined;
    return parseMarkdownSkill(text, /^(skill|readme)$/i.test(fallback) && folder ? folder : fallback === stem ? stem : fallback, core, ignored);
  }

  throw new ValidationError('Unsupported file type: upload a .md file or a .zip archive', { filename });
}
