import { unzipSync } from 'fflate';
import { DEFAULT_SKILL_DESCRIPTION } from './constants.js';

/**
 * PURE parsing helpers for `POST /skills/import` — no DB access, no network
 * access. The route decodes the uploaded content and hands it here; these
 * functions only ever derive a preview DTO from bytes already in memory.
 *
 * Security: an uploaded archive is untrusted input. `parseArchive` must never
 * read, decode, parse, or execute the CONTENT of any entry other than the one
 * `SKILL.md` file — every other entry contributes its path/filename ONLY
 * (`evidence_files`), so a crafted entry (a `.sh`, a symlink target, a huge
 * decoy file) can never reach an interpreter or get echoed back as data.
 */

export interface ParsedMarkdown {
  name: string;
  description: string;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const HEADING_RE = /^#\s+(.+)\s*$/m;
const DEFAULT_SKILL_NAME = 'Imported skill';

/**
 * Split a leading `---\n...\n---` frontmatter block (simple `key: value`
 * lines — not real YAML) off a Markdown document. `name`/`description` come
 * from the frontmatter when present; otherwise `name` falls back to the
 * first `# heading` or a generic default, and `description` falls back to ''.
 * Everything after the frontmatter block (or the whole text, when there is
 * none) is the body.
 */
export function parseMarkdown(text: string): ParsedMarkdown {
  const match = FRONTMATTER_RE.exec(text);
  const frontmatter = match ? parseFrontmatter(match[1]!) : {};
  const body = match ? text.slice(match[0].length) : text;

  const headingMatch = HEADING_RE.exec(body);
  const name = frontmatter.name ?? headingMatch?.[1]?.trim() ?? DEFAULT_SKILL_NAME;
  const description = frontmatter.description ?? DEFAULT_SKILL_DESCRIPTION;

  return { name, description, body };
}

/** Parse `key: value` lines (one per line, first `:` splits), stripping
 *  surrounding quotes from the value. Not a YAML parser — frontmatter here is
 *  only ever flat scalar keys (name/description). */
function parseFrontmatter(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    if (!key) continue;
    let value = line.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export interface ParsedArchive extends ParsedMarkdown {
  evidence_files: string[];
}

const SKILL_MD_RE = /SKILL\.md$/i;

/**
 * Unzip an in-memory archive and parse its SKILL.md.
 *
 * Uses fflate's `filter` option, which runs per-entry BEFORE that entry is
 * inflated — returning `false` skips decompression entirely, not just
 * reading of the already-decompressed bytes. So this is a two-pass unzip:
 *  1. List every entry's path with `filter` always returning `false` — no
 *     entry's content is decompressed, not even SKILL.md's.
 *  2. Decompress ONLY the single matched SKILL.md entry.
 * Every other entry (a `.sh`, a decoy, an oversized file) therefore never has
 * its bytes inflated, decoded, or parsed — only its name is ever read.
 */
export function parseArchive(bytes: Uint8Array): ParsedArchive {
  const paths: string[] = [];
  unzipSync(bytes, {
    filter: (file) => {
      paths.push(file.name);
      return false;
    },
  });

  const skillMdPaths = paths.filter((p) => SKILL_MD_RE.test(p));
  if (skillMdPaths.length === 0) {
    throw new Error('Archive does not contain a SKILL.md file');
  }
  if (skillMdPaths.length > 1) {
    throw new Error(`Archive contains multiple SKILL.md files: ${skillMdPaths.join(', ')}`);
  }
  const skillMdPath = skillMdPaths[0]!;

  const extracted = unzipSync(bytes, { filter: (file) => file.name === skillMdPath });
  const text = new TextDecoder().decode(extracted[skillMdPath]);
  const parsed = parseMarkdown(text);
  const evidence_files = paths.filter((p) => p !== skillMdPath);

  return { ...parsed, evidence_files };
}
