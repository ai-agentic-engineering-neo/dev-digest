import { parse, Lang } from '@ast-grep/napi';

import { KEYWORDS, getField, isInsideImport, leftmostName, lineOf, rightmostName } from './ast-helpers.js';
import { langForFile } from './lang.js';
import { parseSymbols } from './symbols.js';
import type { ParsedReference } from './types.js';

// ---------------------------------------------------------------------------
// parseReferences
// ---------------------------------------------------------------------------

/**
 * Collect call/usage sites. Mirrors extract.ts's intent:
 *   - `sym(`        → call_expression with identifier function
 *   - `.sym(`       → call_expression with member_expression function (use property)
 *   - `new Sym(`    → new_expression
 *   - `<Sym ...>`   → jsx_(opening|self_closing)_element (leftmost identifier)
 * Excludes:
 *   - identifiers inside import_statement subtrees
 *   - the declaration line itself (matched by name + line)
 */
export function parseReferences(file: string, source: string): ParsedReference[] {
  const lang = langForFile(file);
  if (!lang) return [];

  const root = parse(lang, source).root();

  // Build a (name, line) set of declarations so we don't count the decl line.
  const declLines = new Set<string>();
  for (const sym of parseSymbols(file, source)) {
    declLines.add(`${sym.name}:${sym.line}`);
  }

  const out: ParsedReference[] = [];
  const dedup = new Set<string>();
  const push = (name: string, line: number) => {
    if (KEYWORDS.has(name)) return;
    if (declLines.has(`${name}:${line}`)) return;
    const key = `${name}:${line}`;
    if (dedup.has(key)) return;
    dedup.add(key);
    out.push({ toSymbol: name, line, refFile: file });
  };

  for (const n of root.findAll({ rule: { kind: 'call_expression' } })) {
    if (isInsideImport(n)) continue;
    const fn = getField(n, 'function');
    if (!fn) continue;
    if (fn.kind() === 'identifier') {
      push(fn.text(), lineOf(n));
    } else if (fn.kind() === 'member_expression') {
      const prop = rightmostName(fn);
      if (prop) push(prop, lineOf(n));
    }
  }

  for (const n of root.findAll({ rule: { kind: 'new_expression' } })) {
    if (isInsideImport(n)) continue;
    const ctor = getField(n, 'constructor');
    const name = rightmostName(ctor);
    if (name) push(name, lineOf(n));
  }

  // JSX kinds only exist in the Tsx grammar — guard so we don't ask the
  // TS/JS parsers about kinds they don't know.
  if (lang === Lang.Tsx) {
    for (const kind of ['jsx_opening_element', 'jsx_self_closing_element']) {
      for (const n of root.findAll({ rule: { kind } })) {
        if (isInsideImport(n)) continue;
        const nameNode = getField(n, 'name');
        // leftmost identifier of <Foo.Bar> → Foo (matches extract.ts `<Sym` head)
        const leftName = leftmostName(nameNode);
        if (!leftName) continue;
        // Skip lowercase HTML elements (`<div>`, `<span>`) — they're not refs.
        if (/^[a-z]/.test(leftName)) continue;
        push(leftName, lineOf(n));
      }
    }
  }

  return out;
}
