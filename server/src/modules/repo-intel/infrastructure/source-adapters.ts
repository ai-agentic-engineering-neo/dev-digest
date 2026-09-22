/**
 * Infrastructure implementations of the repo-intel source ports:
 *   - `astGrepSourceAnalyzer` — SourceAnalyzer over the ast-grep adapter
 *     (symbols / references / imports / invocation heads) and the regex
 *     extractor (endpoints / crons);
 *   - `cloneFileSystem` — CloneFiles over node:fs (walk + contained reads).
 */
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  langForFile,
  parseImports,
  parseInvocationHeads,
  parseReferences,
  parseSymbols,
} from '../../../adapters/astgrep/index.js';
import { extractCrons, extractEndpoints } from '../../../adapters/codeindex/extract.js';
import type { CloneFiles, SourceAnalyzer } from '../application/ports.js';
import { walkClone } from './walk.js';

export const astGrepSourceAnalyzer: SourceAnalyzer = {
  supports: (file) => langForFile(file) !== null,
  symbols: (file, source) =>
    parseSymbols(file, source).map((s) => ({
      name: s.name,
      kind: s.kind,
      line: s.line,
      endLine: s.endLine,
      exported: s.exported,
      signature: s.signature,
    })),
  references: (file, source) =>
    parseReferences(file, source).map((r) => ({ toSymbol: r.toSymbol, line: r.line })),
  importedNames: (file, source) => parseImports(file, source).map((i) => i.name),
  invocationHeads: (file, source) =>
    parseInvocationHeads(file, source).map((h) => ({ name: h.name, line: h.line })),
  endpoints: (source) => extractEndpoints(source),
  crons: (source) => extractCrons(source),
};

/**
 * Resolve `relPath` under `root`, refusing anything that escapes it
 * (`../`, absolute paths): paths come from git diffs and the code index.
 */
export function containedPath(root: string, relPath: string): string {
  const base = resolve(root);
  const full = resolve(base, relPath);
  const rel = relative(base, full);
  if (!rel || rel.split(sep)[0] === '..' || isAbsolute(rel)) {
    throw new Error(`Path escapes the clone root: ${relPath}`);
  }
  return full;
}

export const cloneFileSystem: CloneFiles = {
  walk: (root) => walkClone(root),
  read: async (root, relPath) => readFile(containedPath(root, relPath), 'utf8'),
};
