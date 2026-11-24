import { unzipSync } from 'fflate';
import { SkillType, type SkillImportPreview } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';

/**
 * Pure skill-import parser: bytes in, preview out. No filesystem, no network,
 * nothing is executed. For archives only ONE markdown file is ever
 * decompressed; every other entry is just listed in `ignored_files`.
 */

export const MAX_ENTRIES = 200;
export const MAX_MD_BYTES = 256 * 1024;
export const MAX_INPUT_BYTES = 1_500_000;

const DEFAULT_TYPE: SkillType = 'custom';

/** Minimal frontmatter: flat `key: value` lines between two `---` fences. */
export function parseFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  if (lines[0]?.trim() !== '---') return { meta: {}, body: src };
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end === -1) return { meta: {}, body: src };
  const meta: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2]!.trim();
    if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) {
      v = v.slice(1, -1);
    }
    meta[m[1]!.toLowerCase()] = v;
  }
  return { meta, body: lines.slice(end + 1).join('\n').replace(/^\n+/, '') };
}

function stripExt(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  return base.replace(/\.[^.]*$/, '');
}

function parseMarkdown(
  filename: string,
  text: string,
  ignored: string[],
  warnings: string[],
): SkillImportPreview {
  const { meta, body } = parseFrontmatter(text);
  let name = meta.name?.trim();
  if (!name) {
    name = stripExt(filename) || 'imported-skill';
    warnings.push(`No "name" in frontmatter; using "${name}" from the filename.`);
  }
  let description = meta.description?.trim();
  if (!description) {
    description = body.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '';
    description = description.replace(/^#+\s*/, '');
    warnings.push('No "description" in frontmatter; using the first line of the body.');
  }
  let type: SkillType = DEFAULT_TYPE;
  const parsed = SkillType.safeParse(meta.type?.trim());
  if (parsed.success) type = parsed.data;
  else warnings.push(`Missing or invalid "type"; defaulting to "${DEFAULT_TYPE}".`);
  if (body.trim().length === 0) throw new ValidationError('Skill body is empty');
  return { name, description, type, body, ignored_files: ignored, warnings };
}

function isUnsafeName(name: string): boolean {
  const parts = name.split(/[\\/]/);
  return name.startsWith('/') || name.startsWith('\\') || /^[A-Za-z]:/.test(name) || parts.includes('..');
}

const decoder = new TextDecoder('utf-8', { fatal: false });

export function parseSkillImport(filename: string, bytes: Uint8Array): SkillImportPreview {
  const lower = filename.toLowerCase();
  const ignored: string[] = [];
  const warnings: string[] = [];

  if (bytes.length === 0) throw new ValidationError('File is empty');
  if (bytes.length > MAX_INPUT_BYTES) throw new ValidationError('File is too large');

  if (lower.endsWith('.md')) {
    if (bytes.length > MAX_MD_BYTES) throw new ValidationError('Markdown file is too large');
    return parseMarkdown(filename, decoder.decode(bytes), ignored, warnings);
  }
  if (!lower.endsWith('.zip')) {
    throw new ValidationError('Unsupported file type: expected .md or .zip');
  }

  // Pass 1: list entries only (filter → false, so nothing is decompressed).
  const entries: { name: string; originalSize: number }[] = [];
  try {
    unzipSync(bytes, {
      filter: (f) => {
        entries.push({ name: f.name, originalSize: f.originalSize });
        if (entries.length > MAX_ENTRIES) throw new ValidationError('Archive has too many entries');
        return false;
      },
    });
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError('Invalid zip archive');
  }

  const candidates: { name: string; originalSize: number }[] = [];
  for (const e of entries) {
    if (e.name.endsWith('/') || e.name.endsWith('\\')) continue; // directory entry
    if (isUnsafeName(e.name)) {
      ignored.push(e.name);
      warnings.push(`Skipped entry with an unsafe path: ${e.name}`);
      continue;
    }
    candidates.push(e);
  }
  const isMd = (n: string) => n.toLowerCase().endsWith('.md');
  const skillMd = candidates.filter((e) => {
    const parts = e.name.split('/');
    return parts.length <= 2 && parts[parts.length - 1]!.toLowerCase() === 'skill.md';
  });
  const allMd = candidates.filter((e) => isMd(e.name));
  const chosen = skillMd[0] ?? (allMd.length === 1 ? allMd[0] : undefined);
  if (!chosen) throw new ValidationError('No SKILL.md (or single .md file) found in the archive');
  if (chosen.originalSize > MAX_MD_BYTES) {
    throw new ValidationError('Markdown file in the archive is too large');
  }
  for (const e of candidates) if (e !== chosen) ignored.push(e.name);

  // Pass 2: decompress ONLY the chosen entry.
  let data: Uint8Array | undefined;
  try {
    const out = unzipSync(bytes, { filter: (f) => f.name === chosen.name });
    data = out[chosen.name];
  } catch {
    throw new ValidationError('Invalid zip archive');
  }
  if (!data) throw new ValidationError('Invalid zip archive');
  if (data.length > MAX_MD_BYTES) throw new ValidationError('Markdown file in the archive is too large');
  return parseMarkdown(chosen.name, decoder.decode(data), ignored, warnings);
}
