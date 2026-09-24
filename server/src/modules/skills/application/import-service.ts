/**
 * Import preview (server/specs/03-skills.md Rules §6–§9). Turns a file upload,
 * a URL or a community id into the skill core the user confirms. PERSISTS
 * NOTHING — the client then POSTs /skills with the (possibly edited) preview,
 * where the trust gate stores it disabled.
 */
import type { CommunitySkill, SkillImportPreview, SkillImportRequest } from '@devdigest/shared';
import { filterCatalog, toCommunityCard, type CatalogFilter } from '../domain/catalog.js';
import { ARCHIVE_MAX_MARKDOWN_BYTES, IMPORT_MAX_BASE64_CHARS } from '../domain/constants.js';
import {
  invalidImport,
  isMarkdownName,
  isZipName,
  pickArchiveEntry,
  skillFromMarkdown,
  stemOf,
} from '../domain/import.js';
import { parseImportUrl } from '../domain/url-guard.js';
import type { ArchiveReader, CommunityCatalog, UrlFetcher } from './ports.js';

export interface SkillImportServiceDeps {
  archive: ArchiveReader;
  fetcher: UrlFetcher;
  catalog: CommunityCatalog;
}

type Preview = SkillImportPreview;

/** Local file header magic of a zip archive (`PK\x03\x04`). */
function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw invalidImport('The file is not valid UTF-8 text');
  }
}

export class SkillImportService {
  constructor(private readonly deps: SkillImportServiceDeps) {}

  /** Built-in community catalog, filtered (no network). */
  community(filter: CatalogFilter): CommunitySkill[] {
    return filterCatalog(this.deps.catalog.list(), filter).map(toCommunityCard);
  }

  async preview(req: SkillImportRequest): Promise<Preview> {
    switch (req.kind) {
      case 'file':
        return this.fromFile(req.filename, req.content_base64);
      case 'url':
        return this.fromUrl(req.url);
      case 'community':
        return this.fromCommunity(req.id);
    }
  }

  private fromFile(filename: string, base64: string): Preview {
    if (base64.length > IMPORT_MAX_BASE64_CHARS) {
      throw invalidImport(`The upload is larger than ${IMPORT_MAX_BASE64_CHARS} base64 chars`);
    }
    const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
    if (isZipName(filename)) return this.fromArchive(bytes, filename, 'imported_file', filename);
    if (!isMarkdownName(filename)) throw invalidImport('Upload a .md, .markdown, .txt or .zip file');
    if (bytes.length > ARCHIVE_MAX_MARKDOWN_BYTES) {
      throw invalidImport(`The file is ${bytes.length} bytes; the limit is ${ARCHIVE_MAX_MARKDOWN_BYTES}`);
    }
    const candidate = skillFromMarkdown(decodeUtf8(bytes), stemOf(filename));
    return { ...candidate, source: 'imported_file', source_ref: filename, included_files: [filename], ignored_files: [] };
  }

  private fromArchive(bytes: Uint8Array, archiveName: string, source: Preview['source'], sourceRef: string): Preview {
    let entries: ReturnType<ArchiveReader['list']>;
    try {
      entries = this.deps.archive.list(bytes);
    } catch {
      throw invalidImport('The archive could not be read (not a valid .zip)');
    }
    const pick = pickArchiveEntry(entries, archiveName);
    let markdown: string;
    try {
      markdown = this.deps.archive.readText(bytes, pick.chosen, ARCHIVE_MAX_MARKDOWN_BYTES);
    } catch (err) {
      throw invalidImport(`${pick.chosen} could not be read: ${(err as Error).message}`);
    }
    const candidate = skillFromMarkdown(markdown, pick.fallbackName);
    return { ...candidate, source, source_ref: sourceRef, included_files: [pick.chosen], ignored_files: pick.ignored };
  }

  private async fromUrl(raw: string): Promise<Preview> {
    const url = parseImportUrl(raw);
    const doc = await this.deps.fetcher.fetch(url);
    const path = new URL(doc.finalUrl).pathname;
    const zip =
      isZipName(path) || looksLikeZip(doc.bytes) || (doc.contentType ?? '').toLowerCase().includes('zip');
    if (zip) return this.fromArchive(doc.bytes, stemOf(path) || 'archive.zip', 'imported_url', raw.trim());
    const candidate = skillFromMarkdown(decodeUtf8(doc.bytes), stemOf(path) || url.hostname);
    return {
      ...candidate,
      source: 'imported_url',
      source_ref: raw.trim(),
      included_files: [path],
      ignored_files: [],
    };
  }

  private fromCommunity(id: string): Preview {
    const entry = this.deps.catalog.get(id);
    if (!entry) throw invalidImport(`Unknown community skill "${id}"`);
    const candidate = skillFromMarkdown(entry.body, entry.name);
    return {
      ...candidate,
      // The curated entry's own metadata wins over what the body parser derives.
      name: entry.name,
      description: entry.description,
      type: entry.type,
      source: 'community',
      source_ref: `community:${entry.id}`,
      included_files: [`${entry.name}.md`],
      ignored_files: [],
    };
  }
}
