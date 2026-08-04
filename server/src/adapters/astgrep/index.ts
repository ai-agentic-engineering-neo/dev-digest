/**
 * ast-grep adapter — tree-sitter-backed extractor, dispatched by language.
 *
 * This is the AST-accurate complement to `adapters/codeindex/extract.ts`. The
 * regex extractor stays as the ALWAYS-available fallback; this adapter is the
 * "good path" used by the repo-intel facade (wired by T1.3).
 *
 * Compatibility baseline: `ParsedSymbol extends ExtractedSymbol` and
 * `ParsedReference extends ExtractedReference`, so any consumer of the
 * degraded path can swap to this adapter without changing field reads.
 *
 * Thin dispatcher only — the actual per-language walking lives in
 * `./langs/typescript.ts` and `./langs/go.ts` (each language differs
 * structurally, not just in kind-name spelling; see
 * `docs/go-language-support-plan.md`'s "Implementation notes" section for
 * why this isn't one generic config-driven walker). Every function below
 * keeps its original signature — existing callers (`repo-intel/service.ts`,
 * the walk pipelines) need zero changes.
 *
 * Scope: in-memory parse only. No DB writes, no fs walks beyond the explicit
 * `parseChangedFiles` helper (which reads files diff-scoped under `root`).
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { SUPPORTED_EXT_SET, languageIdForFile } from '../../modules/repo-intel/languages/index.js';
import * as go from './langs/go.js';
import * as typescript from './langs/typescript.js';
import type {
  ChangedFilesResult,
  ParsedImport,
  ParsedInvocationHead,
  ParsedReference,
  ParsedSymbol,
} from './shared.js';

export type {
  ChangedFilesResult,
  ParsedImport,
  ParsedInvocationHead,
  ParsedReference,
  ParsedSymbol,
} from './shared.js';

/**
 * Truthy iff this file's extension is indexed by a language module — value
 * itself is opaque (an ast-grep `Lang` enum member for TS/JS, the string
 * `'go'` for Go) and every current caller only checks truthiness, never the
 * specific value.
 */
export function langForFile(file: string): unknown | null {
  return typescript.langForFile(file) ?? go.langForFile(file);
}

export function parseSymbols(file: string, source: string): ParsedSymbol[] {
  switch (languageIdForFile(file)) {
    case 'typescript':
      return typescript.parseSymbols(file, source);
    case 'go':
      return go.parseSymbols(file, source);
    default:
      return [];
  }
}

export function parseReferences(file: string, source: string): ParsedReference[] {
  switch (languageIdForFile(file)) {
    case 'typescript':
      return typescript.parseReferences(file, source);
    case 'go':
      return go.parseReferences(file, source);
    default:
      return [];
  }
}

export function parseInvocationHeads(file: string, source: string): ParsedInvocationHead[] {
  switch (languageIdForFile(file)) {
    case 'typescript':
      return typescript.parseInvocationHeads(file, source);
    case 'go':
      return go.parseInvocationHeads(file, source);
    default:
      return [];
  }
}

export function parseImports(file: string, source: string): ParsedImport[] {
  switch (languageIdForFile(file)) {
    case 'typescript':
      return typescript.parseImports(file, source);
    case 'go':
      return go.parseImports(file, source);
    default:
      return [];
  }
}

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
    if (!SUPPORTED_EXT_SET.has(rel.slice(rel.lastIndexOf('.')).toLowerCase())) continue;

    let source: string;
    try {
      source = await readFile(join(root, rel), 'utf8');
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
