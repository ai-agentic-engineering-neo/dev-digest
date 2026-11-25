import { parse, Lang } from '@ast-grep/napi';

import { KEYWORDS, getField, isInsideImport, leftmostName, lineOf } from './ast-helpers.js';
import { langForFile } from './lang.js';
import type { ParsedInvocationHead } from './types.js';

// ---------------------------------------------------------------------------
// parseInvocationHeads — T1.3 Phantom-API gate fuel
// ---------------------------------------------------------------------------

/**
 * Bare-identifier invocation heads only — the phantom-gate's high-precision
 * input. We DELIBERATELY skip `x.foo()` (member calls) because we can't
 * resolve `foo` via imports without type info, and flagging it would be a
 * false-positive factory.
 *
 *   `sym(`         → call_expression where `function` is an `identifier`
 *   `new Sym(`     → new_expression where `constructor` is an `identifier`
 *   `<Sym ...>`    → JSX (Tsx only) with capitalized leftmost identifier
 */
export function parseInvocationHeads(file: string, source: string): ParsedInvocationHead[] {
  const lang = langForFile(file);
  if (!lang) return [];

  const root = parse(lang, source).root();
  const out: ParsedInvocationHead[] = [];
  const dedup = new Set<string>();
  const push = (name: string, line: number, kind: 'call' | 'new' | 'jsx') => {
    if (KEYWORDS.has(name)) return;
    const key = `${name}:${line}:${kind}`;
    if (dedup.has(key)) return;
    dedup.add(key);
    out.push({ name, line, kind });
  };

  for (const n of root.findAll({ rule: { kind: 'call_expression' } })) {
    if (isInsideImport(n)) continue;
    const fn = getField(n, 'function');
    if (!fn) continue;
    // BARE identifiers only — member_expression callees are skipped on purpose
    // (see header). This is what keeps the phantom-gate precise.
    if (fn.kind() === 'identifier') {
      push(fn.text(), lineOf(n), 'call');
    }
  }

  for (const n of root.findAll({ rule: { kind: 'new_expression' } })) {
    if (isInsideImport(n)) continue;
    const ctor = getField(n, 'constructor');
    if (!ctor) continue;
    if (ctor.kind() === 'identifier') {
      push(ctor.text(), lineOf(n), 'new');
    }
  }

  // JSX is Tsx-only (the TS/JS grammars don't surface these kinds). Restrict to
  // capitalized leftmost identifiers — lowercase `<div>` etc. are HTML tags,
  // not user-land symbols.
  if (lang === Lang.Tsx) {
    for (const kind of ['jsx_opening_element', 'jsx_self_closing_element']) {
      for (const n of root.findAll({ rule: { kind } })) {
        if (isInsideImport(n)) continue;
        const nameNode = getField(n, 'name');
        const leftName = leftmostName(nameNode);
        if (!leftName) continue;
        if (/^[a-z]/.test(leftName)) continue;
        push(leftName, lineOf(n), 'jsx');
      }
    }
  }

  return out;
}
