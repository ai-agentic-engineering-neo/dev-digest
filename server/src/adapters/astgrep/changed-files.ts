import { extname } from 'node:path';

import { readContainedFile } from '../../platform/contained-read.js';
import { parseImports } from './imports.js';
import { SUPPORTED_SET } from './lang.js';
import { parseReferences } from './references.js';
import { parseSymbols } from './symbols.js';
import type { ChangedFilesResult, ParsedImport, ParsedReference, ParsedSymbol } from './types.js';

// ---------------------------------------------------------------------------
// parseChangedFiles
// ---------------------------------------------------------------------------


/**
 * Read each path under `root`, skip non-SUPPORTED_EXT, skip unreadable, parse
 * the rest in memory. No DB writes. This is the diff-scoped entry T1.3 calls.
 */
export async function parseChangedFiles(
  root: string,
  changedFiles: string[],
): Promise<ChangedFilesResult> {
  const symbols: ParsedSymbol[] = [];
  const references: ParsedReference[] = [];
  const imports: Array<ParsedImport & { file: string }> = [];

  for (const rel of changedFiles) {
    const ext = extname(rel).toLowerCase();
    if (!SUPPORTED_SET.has(ext)) continue;

    let source: string;
    try {
      const contained = await readContainedFile(root, rel);
      if (contained === null) continue;
      source = contained;
    } catch {
      continue;
    }

    // Per-file try/catch — one syntactically broken file shouldn't blow up
    // the whole diff-scoped parse. Tree-sitter is lenient (it produces an
    // error tree rather than throwing) but napi binding errors are possible.
    try {
      for (const s of parseSymbols(rel, source)) symbols.push({ ...s, kind: s.kind });
      for (const r of parseReferences(rel, source)) references.push(r);
      for (const i of parseImports(rel, source)) imports.push({ file: rel, ...i });
    } catch {
      // skip file on parse failure
    }
  }

  return { symbols, references, imports };
}
