/**
 * skill-import adapters (M2) — the two parsers behind the skills module's
 * import ports.
 *
 * - `FflateArchiveReader`: reads a zip entirely in memory with `fflate`.
 *   `list` walks the central directory with a filter that refuses every
 *   entry, so nothing is inflated; `inflate` decompresses exactly one named
 *   entry. Nothing is written to disk and nothing is executed.
 * - `YamlFrontmatterParser`: `yaml` with the core schema and no custom tags,
 *   so a frontmatter block cannot construct anything but plain data.
 */
import { unzipSync } from 'fflate';
import { parse } from 'yaml';
import type { ArchiveEntry, ArchiveReader, FrontmatterParser } from '../../modules/skills/ports.js';

export class FflateArchiveReader implements ArchiveReader {
  list(data: Uint8Array): ArchiveEntry[] {
    const entries: ArchiveEntry[] = [];
    unzipSync(data, {
      filter: (file) => {
        entries.push({ path: file.name, size: file.originalSize, isDirectory: file.name.endsWith('/') });
        return false; // list only: never inflate here
      },
    });
    return entries;
  }

  inflate(data: Uint8Array, path: string): Uint8Array {
    const out = unzipSync(data, { filter: (file) => file.name === path });
    const bytes = out[path];
    if (!bytes) throw new Error(`Entry not found: ${path}`);
    return bytes;
  }
}

export class YamlFrontmatterParser implements FrontmatterParser {
  parse(yaml: string): unknown {
    return parse(yaml, { schema: 'core', customTags: [], maxAliasCount: 10 });
  }
}
