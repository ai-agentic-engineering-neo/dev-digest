/**
 * ast-grep adapter — language-agnostic tree helpers + public types.
 *
 * Split out of what used to be one TS/JS-only `index.ts` so a second language
 * (Go) can share the parts that never referenced a TS/JS-specific grammar
 * kind name in the first place: line/signature extraction, generic node-kind
 * filtering, and symbol dedup. Everything here operates purely on `SgNode`'s
 * generic `.kind()`/`.field()`/`.children()`/`.text()`/`.range()` surface.
 *
 * Per-language node-kind matching (what `function_declaration` vs
 * `method_declaration` vs `selector_expression` MEANS, and how "exported" is
 * even determined — an AST fact in TS/JS, a naming convention in Go) lives in
 * `./langs/*.ts`, not here — see the design note in
 * `docs/go-language-support-plan.md`'s "Implementation notes" section for why
 * that's a per-language module split rather than one generic config object.
 */
import type { SgNode } from '@ast-grep/napi';
import type { ExtractedReference, ExtractedSymbol } from '../codeindex/extract.js';
import { MAX_SIGNATURE_CHARS } from '../../modules/repo-intel/constants.js';

// ---------------------------------------------------------------------------
// Public types — superset of the regex extractor's row shapes.
// ---------------------------------------------------------------------------

export interface ParsedSymbol extends ExtractedSymbol {
  /** True when the declaration is reached through an `export` form. */
  exported: boolean;
  /** Declaration head trimmed to MAX_SIGNATURE_CHARS; null for kinds without one. */
  signature: string | null;
  /** 1-based line of the closing token of the declaration body. */
  endLine: number;
}

export interface ParsedReference extends ExtractedReference {
  /** Path passed in by the caller — surfaced so consumers can fan-out. */
  refFile: string;
}

export interface ParsedImport {
  name: string;
  source: string;
  isType: boolean;
}

export interface ParsedInvocationHead {
  /** The bare identifier being invoked (callee name, ctor name, or JSX tag). */
  name: string;
  /** 1-based line of the invocation. */
  line: number;
  /** Which AST shape produced this head. */
  kind: 'call' | 'new' | 'jsx';
}

export interface ChangedFilesResult {
  symbols: ParsedSymbol[];
  references: ParsedReference[];
  imports: Array<ParsedImport & { file: string }>;
}

// ---------------------------------------------------------------------------
// Generic tree helpers — no TS/JS/Go-specific kind name anywhere below.
// ---------------------------------------------------------------------------

/** 0-based ast-grep line → 1-based file line (matches extract.ts). */
export function lineOf(n: SgNode): number {
  return n.range().start.line + 1;
}

export function endLineOf(n: SgNode): number {
  return n.range().end.line + 1;
}

/**
 * Return the declaration head as a single-line, length-bounded signature.
 * Strategy: take node text up to the body's start (when a body field exists),
 * otherwise use the whole text. Collapse whitespace, drop trailing punctuation
 * that's part of the head/body boundary, then trim to MAX_SIGNATURE_CHARS.
 */
export function headSignature(n: SgNode): string {
  const range = n.range();
  const fullText = n.text();
  let head = fullText;

  // `.field('body')` is typed against the language's static map; cast away the
  // strictness — at runtime it accepts any field name and returns SgNode|null.
  const body = (n as unknown as { field(name: string): SgNode | null }).field('body');
  if (body) {
    const offset = body.range().start.index - range.start.index;
    if (offset > 0 && offset <= fullText.length) head = fullText.slice(0, offset);
  }

  head = head.replace(/\s+/g, ' ').trim();
  // Strip a trailing `{`, `=`, or `=>` that comes from the body boundary.
  head = head.replace(/(?:\s*=>|\s*\{|\s*=)\s*$/, '').trim();

  if (head.length > MAX_SIGNATURE_CHARS) {
    head = head.slice(0, MAX_SIGNATURE_CHARS - 1) + '…';
  }
  return head;
}

/** Children iterator with a kind filter. */
export function childrenOfKind(n: SgNode, kind: string): SgNode[] {
  return n.children().filter((c) => c.kind() === kind);
}

export function getField(n: SgNode, name: string): SgNode | null {
  return (n as unknown as { field(name: string): SgNode | null }).field(name);
}

/** True when `n` (or any ancestor) is inside a node of the given kind — the
 *  "am I part of an import statement" check, parameterized by whichever kind
 *  name means "import" in the caller's grammar (`import_statement` for
 *  TS/JS, `import_declaration` for Go). */
export function isInsideKind(n: SgNode, kind: string): boolean {
  for (const a of n.ancestors()) if (a.kind() === kind) return true;
  return false;
}

/** Keep the most-exported version of each (name, kind, line); first-seen
 *  otherwise. Shared across languages — operates purely on the shape, not on
 *  what "exported" means for a given language. */
export function dedupeSymbols(syms: ParsedSymbol[]): ParsedSymbol[] {
  const seen = new Map<string, ParsedSymbol>();
  for (const s of syms) {
    const key = `${s.name}:${s.kind}:${s.line}`;
    const prior = seen.get(key);
    if (!prior) seen.set(key, s);
    else if (s.exported && !prior.exported) seen.set(key, s);
  }
  return [...seen.values()];
}
