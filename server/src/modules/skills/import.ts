import path from 'node:path';
import { unzipSync } from 'fflate';
import { AppError } from '../../platform/errors.js';

/**
 * Pure `.md`/`.txt`/`.zip` skill-import parsing — no DB write, no file-upload
 * plugin (the client reads the file locally and POSTs base64 JSON; see
 * `SkillsService.importFromFile`). Kept out of `service.ts` so it stays easy
 * to unit-test in isolation.
 */

export interface ImportSkillFileInput {
  filename: string;
  content_base64: string;
}

export interface ImportSkillResult {
  name: string;
  body: string;
  warnings: string[];
}

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);
const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);

/** A zip listing entry is a directory iff its name ends in '/' (fflate's convention). */
function isDirEntry(name: string): boolean {
  return name.endsWith('/');
}

function isMarkdownEntry(name: string): boolean {
  return !isDirEntry(name) && MARKDOWN_EXTENSIONS.has(path.extname(name).toLowerCase());
}

/** First `# heading` line in the body, else the filename without its extension. */
function deriveName(body: string, filename: string): string {
  const heading = body.match(/^\s*#\s+(.+?)\s*$/m);
  if (heading?.[1]) return heading[1];
  return path.basename(filename, path.extname(filename));
}

function decodeUtf8(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('utf-8');
}

export function importSkillFromFile(input: ImportSkillFileInput): ImportSkillResult {
  const ext = path.extname(input.filename).toLowerCase();
  const buf = Buffer.from(input.content_base64, 'base64');

  if (TEXT_EXTENSIONS.has(ext)) {
    const body = decodeUtf8(buf);
    return { name: deriveName(body, input.filename), body, warnings: [] };
  }

  if (ext === '.zip') {
    const entries = unzipSync(buf);
    const names = Object.keys(entries);
    const mdName = names.find(isMarkdownEntry);
    if (!mdName) {
      throw new AppError('bad_request', 'No markdown file found in archive');
    }
    const otherCount = names.filter((n) => n !== mdName && !isDirEntry(n)).length;
    const warnings: string[] =
      otherCount > 0
        ? [`ignored ${otherCount} other file(s) in the archive (not processed)`]
        : [];
    const body = decodeUtf8(entries[mdName]!);
    return { name: deriveName(body, mdName), body, warnings };
  }

  throw new AppError('bad_request', `Unsupported file type: ${input.filename || ext}`);
}
