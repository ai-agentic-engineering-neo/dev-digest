import { unzipSync } from 'fflate';
import { SkillType, type SkillImportFile, type SkillImportPreview } from '@devdigest/shared';
import {
  ARCHIVE_EXTENSIONS,
  DEFAULT_IMPORT_TYPE,
  MARKDOWN_EXTENSIONS,
  MAX_ARCHIVE_ENTRIES,
  MAX_IMPORT_BYTES,
  MAX_SKILL_MD_BYTES,
  SKILL_ENTRY_NAME,
} from './constants.js';

/**
 * Skill import — pure parsing of an uploaded `.md` or `.zip` into the skill's
 * core (name, description, body). Nothing is written to disk and nothing from
 * the upload is executed: of an archive only `SKILL.md` is decompressed, every
 * other entry (scripts, binaries, extra docs) is reported back as skipped.
 */

export type ImportResult =
  | { ok: true; preview: SkillImportPreview }
  | { ok: false; error: string };

export interface Frontmatter {
  attrs: Record<string, string>;
  body: string;
}

const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Minimal YAML-frontmatter reader: flat `key: value` pairs, quoted values and
 * `>` / `|` block scalars. Nested structures are ignored — a skill only needs
 * name / description / type.
 */
export function parseFrontmatter(text: string): Frontmatter {
  const match = FRONTMATTER_RE.exec(text);
  if (!match) return { attrs: {}, body: text };
  const attrs: Record<string, string> = {};
  const lines = match[1]!.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(lines[i]!);
    if (!kv) continue;
    const key = kv[1]!;
    let value = kv[2]!.trim();
    if (/^[>|][+-]?$/.test(value)) {
      const folded = value.startsWith('>');
      const block: string[] = [];
      // Continuation = following lines that are indented or blank.
      while (i + 1 < lines.length && /^(\s|$)/.test(lines[i + 1]!)) {
        block.push(lines[++i]!.trim());
      }
      value = folded ? block.filter(Boolean).join(' ') : block.join('\n').trim();
    } else if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    attrs[key] = value;
  }
  return { attrs, body: text.slice(match[0].length) };
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

function stem(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return undefined;
  }
}

/** Turn markdown text (with optional frontmatter) into the preview fields. */
export function skillFromMarkdown(
  text: string,
  fallbackName: string,
  files: SkillImportFile[],
): ImportResult {
  const { attrs, body: rawBody } = parseFrontmatter(text);
  const body = rawBody.trim();
  if (!body) return { ok: false, error: 'The skill body is empty.' };
  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  const name = (attrs.name?.trim() || heading || fallbackName).slice(0, 120);
  const type = SkillType.safeParse(attrs.type);
  return {
    ok: true,
    preview: {
      name,
      description: (attrs.description ?? '').trim().slice(0, 1000),
      type: type.success ? type.data : DEFAULT_IMPORT_TYPE,
      body,
      files,
    },
  };
}

/** Pick `SKILL.md` at the archive root, else in a single top-level folder. */
function findSkillEntry(names: string[]): string | undefined {
  if (names.includes(SKILL_ENTRY_NAME)) return SKILL_ENTRY_NAME;
  const nested = names.filter((n) => {
    const parts = n.split('/');
    return parts.length === 2 && parts[1] === SKILL_ENTRY_NAME;
  });
  return nested.length === 1 ? nested[0] : undefined;
}

function parseArchive(bytes: Uint8Array, filename: string): ImportResult {
  // Pass 1: list entries without decompressing anything.
  const entries: Array<{ name: string; size: number }> = [];
  try {
    unzipSync(bytes, {
      filter: (f) => {
        entries.push({ name: f.name, size: f.originalSize });
        return false;
      },
    });
  } catch {
    return { ok: false, error: 'Not a valid .zip archive.' };
  }
  const fileEntries = entries.filter((e) => !e.name.endsWith('/'));
  if (fileEntries.length > MAX_ARCHIVE_ENTRIES) {
    return { ok: false, error: `Archive has more than ${MAX_ARCHIVE_ENTRIES} entries.` };
  }
  const chosen = findSkillEntry(fileEntries.map((e) => e.name));
  if (!chosen) {
    return { ok: false, error: `No ${SKILL_ENTRY_NAME} found at the archive root or in a single top-level folder.` };
  }
  const chosenEntry = fileEntries.find((e) => e.name === chosen)!;
  if (chosenEntry.size > MAX_SKILL_MD_BYTES) {
    return { ok: false, error: `${SKILL_ENTRY_NAME} is larger than ${MAX_SKILL_MD_BYTES / 1024} KB.` };
  }

  const files: SkillImportFile[] = fileEntries.map((e) =>
    e.name === chosen
      ? { path: e.name, status: 'used' }
      : { path: e.name, status: 'skipped', reason: 'Only SKILL.md is imported; other files are never read or executed.' },
  );

  // Pass 2: decompress only the chosen entry.
  let data: Uint8Array | undefined;
  try {
    data = unzipSync(bytes, { filter: (f) => f.name === chosen })[chosen];
  } catch {
    return { ok: false, error: `Could not decompress ${SKILL_ENTRY_NAME}.` };
  }
  if (!data || data.length > MAX_SKILL_MD_BYTES) {
    return { ok: false, error: `Could not read ${SKILL_ENTRY_NAME}.` };
  }
  const text = decodeUtf8(data);
  if (text === undefined) return { ok: false, error: `${SKILL_ENTRY_NAME} is not UTF-8 text.` };

  const folder = chosen.includes('/') ? chosen.split('/')[0]! : stem(filename);
  return skillFromMarkdown(text, folder, files);
}

/** Parse an uploaded file into a skill preview. Never persists anything. */
export function parseSkillImport(filename: string, bytes: Uint8Array): ImportResult {
  if (bytes.length === 0) return { ok: false, error: 'The file is empty.' };
  if (bytes.length > MAX_IMPORT_BYTES) {
    return { ok: false, error: `The file is larger than ${MAX_IMPORT_BYTES / 1024 / 1024} MB.` };
  }
  const ext = extensionOf(filename);
  if ((ARCHIVE_EXTENSIONS as readonly string[]).includes(ext)) return parseArchive(bytes, filename);
  if ((MARKDOWN_EXTENSIONS as readonly string[]).includes(ext)) {
    if (bytes.length > MAX_SKILL_MD_BYTES) {
      return { ok: false, error: `Markdown file is larger than ${MAX_SKILL_MD_BYTES / 1024} KB.` };
    }
    const text = decodeUtf8(bytes);
    if (text === undefined) return { ok: false, error: 'The file is not UTF-8 text.' };
    return skillFromMarkdown(text, stem(filename), [{ path: filename, status: 'used' }]);
  }
  return { ok: false, error: 'Unsupported file type — upload a .md or .zip file.' };
}
