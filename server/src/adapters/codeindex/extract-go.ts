/**
 * Regex symbol/reference extractor for Go — the ALWAYS-available fallback
 * when the AST path (`adapters/astgrep/langs/go.ts`) is unavailable or fails
 * on a given file, mirroring `extract.ts`'s "never throw, degrade to
 * partial" contract for TS/JS. Line-based, same conservative-about-false-
 * positives posture (skip comments, skip import lines).
 *
 * Deliberately NOT parameterized/shared with `extract.ts` — the regex bodies
 * are 100% shaped by each language's syntax (no `class`, `func`/
 * `func (recv Type) Method`, `type X struct`/`interface`, no `new`), so a
 * shared config would just be indirection around two unrelated pattern sets.
 */
import type { ExtractedReference, ExtractedSymbol } from './extract.js';

const LINE_COMMENT = /^\s*\/\//;
const IMPORT_LINE = /^\s*import\s|^\s*"[^"]*"\s*$/;

/** Strip `//` comment tails and blank out string contents (crude, matches extract.ts). */
function sanitizeLine(line: string): string {
  let s = line.replace(/\/\/.*$/, '');
  s = s.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""');
  return s;
}

// func Name(   — a plain function. Deliberately excludes `func (recv ...)
// Name(` (a method) via the negative lookahead on a leading `(`.
const FUNC_RE = /^func\s+(?!\()([A-Za-z_]\w*)\s*\(/;
// func (recv Type) Name(   |   func (recv *Type) Name(
const METHOD_RE = /^func\s*\(\s*\w+\s+\*?([A-Za-z_]\w*)\s*\)\s*([A-Za-z_]\w*)\s*\(/;
const STRUCT_RE = /^type\s+([A-Za-z_]\w*)\s+struct\b/;
const INTERFACE_RE = /^type\s+([A-Za-z_]\w*)\s+interface\b/;
// Any other `type Name ...` — alias/defined type. Tried last (STRUCT_RE /
// INTERFACE_RE already matched those specific shapes).
const TYPE_RE = /^type\s+([A-Za-z_]\w*)\s+\S/;

/**
 * Extract declared symbols from a single Go file's source. Methods are
 * reported as `<Receiver>.<method>` AND bare `<method>`, mirroring the
 * dual-emit convention `extract.ts`/`astgrep/langs/go.ts` both use.
 */
export function extractGoSymbols(content: string): ExtractedSymbol[] {
  const out: ExtractedSymbol[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    if (LINE_COMMENT.test(raw)) continue;
    const line = sanitizeLine(raw);

    const method = line.match(METHOD_RE);
    if (method?.[1] && method[2]) {
      out.push({ name: `${method[1]}.${method[2]}`, kind: 'method', line: i + 1 });
      out.push({ name: method[2], kind: 'method', line: i + 1 });
      continue;
    }

    const fn = line.match(FUNC_RE);
    if (fn?.[1]) {
      out.push({ name: fn[1], kind: 'function', line: i + 1 });
      continue;
    }

    const struct = line.match(STRUCT_RE);
    if (struct?.[1]) {
      out.push({ name: struct[1], kind: 'class', line: i + 1 });
      continue;
    }

    const iface = line.match(INTERFACE_RE);
    if (iface?.[1]) {
      out.push({ name: iface[1], kind: 'interface', line: i + 1 });
      continue;
    }

    const alias = line.match(TYPE_RE);
    if (alias?.[1]) {
      out.push({ name: alias[1], kind: 'type', line: i + 1 });
    }
  }

  return dedupeSymbols(out);
}

function dedupeSymbols(syms: ExtractedSymbol[]): ExtractedSymbol[] {
  const seen = new Set<string>();
  const out: ExtractedSymbol[] = [];
  for (const s of syms) {
    const key = `${s.name}:${s.kind}:${s.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Find references (call sites) of `symbol` in a Go file's source. Matches
 * `sym(` and `.sym(` (selector-expression calls) — no `new`, no JSX, neither
 * exists in Go. Skips import lines and comment lines, and the declaration
 * line itself.
 */
export function extractGoReferences(content: string, symbol: string): ExtractedReference[] {
  const bare = symbol.includes('.') ? symbol.split('.').pop()! : symbol;
  const escaped = bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const callRe = new RegExp(`(?<![\\w.])${escaped}\\s*\\(`); // sym(
  const memberCallRe = new RegExp(`\\.${escaped}\\s*\\(`); // .sym(
  const declRe = new RegExp(`^func\\s*(?:\\([^)]*\\)\\s*)?${escaped}\\b|^type\\s+${escaped}\\b`);

  const out: ExtractedReference[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    if (LINE_COMMENT.test(raw) || IMPORT_LINE.test(raw)) continue;
    const line = sanitizeLine(raw);
    if (declRe.test(line)) continue; // the declaration itself is not a reference
    if (callRe.test(line) || memberCallRe.test(line)) {
      out.push({ toSymbol: symbol, line: i + 1 });
    }
  }
  return out;
}
