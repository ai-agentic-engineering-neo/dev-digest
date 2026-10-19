import type { SkillIgnoredFile, SkillImportPreview, SkillType } from '@devdigest/shared';
import {
  EXECUTABLE_DIRS,
  EXECUTABLE_EXTENSIONS,
  IGNORED_FRONTMATTER_KEYS,
  SKILL_CORE_FILE,
} from './constants.js';

/**
 * L02 — skill rules that hold regardless of storage or transport:
 *  - what the "core" of an imported skill is (SKILL.md or a lone .md) and that
 *    nothing else in an archive is ever read — code files are only listed;
 * Pure: no I/O, no zod, no framework.
 */

export class SkillDomainError extends Error {
  constructor(
    readonly code: 'skill_name_taken' | 'skill_import_invalid' | 'skill_import_no_core',
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

const SKILL_TYPES: readonly SkillType[] = ['rubric', 'convention', 'security', 'custom'];

// ---------------------------------------------------------------- frontmatter

export interface ParsedMarkdown {
  attrs: Record<string, string>;
  body: string;
}

/**
 * Minimal YAML frontmatter: `key: value` pairs, optional quotes, and `|` / `>`
 * block scalars with indented continuation lines. Anything fancier is kept as a
 * raw string — frontmatter here only feeds editable form fields.
 */
export function parseFrontmatter(markdown: string): ParsedMarkdown {
  const text = markdown.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  if (!m) return { attrs: {}, body: text.trim() };

  const attrs: Record<string, string> = {};
  const lines = m[1]!.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(lines[i]!);
    if (!kv) continue;
    const key = kv[1]!.toLowerCase();
    let value = kv[2]!.trim();
    if (value === '|' || value === '>' || value === '|-' || value === '>-' || value === '') {
      const block: string[] = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]!)) block.push(lines[++i]!.trim());
      value = block.join(value.startsWith('|') ? '\n' : ' ');
    }
    attrs[key] = unquote(value);
  }
  return { attrs, body: text.slice(m[0].length).trim() };
}

function unquote(v: string): string {
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  return v;
}

// ---------------------------------------------------------------- import

export function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function depth(path: string): number {
  return path.split('/').length - 1;
}

/** Code is listed as `executable` (never read); everything else as `not-core`. */
export function classifyIgnored(path: string): SkillIgnoredFile['reason'] {
  const segments = path.toLowerCase().split('/');
  if (segments.slice(0, -1).some((s) => (EXECUTABLE_DIRS as readonly string[]).includes(s))) return 'executable';
  const name = segments[segments.length - 1]!;
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1) : '';
  return (EXECUTABLE_EXTENSIONS as readonly string[]).includes(ext) ? 'executable' : 'not-core';
}

/** OS junk that is skipped silently (not even listed). */
export function isJunk(path: string): boolean {
  return path.startsWith('__MACOSX/') || basename(path) === '.DS_Store';
}

/**
 * Pick the core file of an archive: `SKILL.md` at the root or inside a single
 * top-level folder (shallowest wins); otherwise a lone `.md` at that depth.
 */
export function pickCorePath(paths: string[]): string {
  const shallow = paths.filter((p) => depth(p) <= 1);
  const skillFiles = shallow
    .filter((p) => basename(p).toLowerCase() === SKILL_CORE_FILE)
    .sort((a, b) => depth(a) - depth(b));
  if (skillFiles[0]) return skillFiles[0];
  const markdown = shallow.filter((p) => p.toLowerCase().endsWith('.md'));
  if (markdown.length === 1) return markdown[0]!;
  throw new SkillDomainError(
    'skill_import_no_core',
    'No SKILL.md found at the archive root or in its top-level folder',
  );
}

function slugFromPath(path: string): string {
  const segments = path.split('/');
  const file = segments[segments.length - 1]!;
  const parent = segments.length > 1 ? segments[segments.length - 2]! : '';
  const stem = file.replace(/\.md$/i, '');
  return (stem.toLowerCase() === 'skill' && parent ? parent : stem).trim() || 'imported-skill';
}

/**
 * Build the editable preview from the core markdown. Nothing here is trusted
 * or persisted — the user reviews and confirms in the UI first.
 */
export function buildImportPreview(
  corePath: string,
  markdown: string,
  ignored: SkillIgnoredFile[],
): SkillImportPreview {
  const { attrs, body } = parseFrontmatter(markdown);
  const warnings: string[] = [];

  const name = attrs.name?.trim() || slugFromPath(corePath);
  if (!attrs.name) warnings.push(`No "name" in frontmatter — using "${name}".`);

  const description = attrs.description?.trim() ?? '';
  if (!description) {
    warnings.push('No "description" in frontmatter — write a directive one before saving.');
  }

  const rawType = attrs.type?.trim().toLowerCase();
  const type = SKILL_TYPES.find((t) => t === rawType) ?? 'custom';
  if (rawType && type !== rawType) warnings.push(`Unknown type "${attrs.type}" — using "custom".`);

  const powers = IGNORED_FRONTMATTER_KEYS.filter((k) => k in attrs);
  if (powers.length > 0) {
    warnings.push(`Ignored frontmatter (${powers.join(', ')}) — skills here are text only.`);
  }
  const executables = ignored.filter((f) => f.reason === 'executable').length;
  if (executables > 0) {
    warnings.push(`${executables} executable file(s) were not read or run.`);
  }
  if (!body) {
    throw new SkillDomainError('skill_import_invalid', `${corePath} has no instructions after the frontmatter`);
  }

  return { name, description, type, body, core_path: corePath, ignored_files: ignored, warnings };
}
