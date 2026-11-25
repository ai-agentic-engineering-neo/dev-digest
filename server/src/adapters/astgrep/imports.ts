import { parse } from '@ast-grep/napi';

import { childrenOfKind, getField } from './ast-helpers.js';
import { langForFile } from './lang.js';
import type { ParsedImport } from './types.js';

// ---------------------------------------------------------------------------
// parseImports
// ---------------------------------------------------------------------------

/**
 * Resolve import bindings — the names that, if used downstream, are NOT
 * unresolved (T1.3's phantom-gate uses this to decide "declared-or-imported
 * vs hallucinated").
 *
 * Covers:
 *   - default:   `import foo from 'x'`           → { name: 'foo' }
 *   - named:     `import { a, b as c } from 'x'` → { name: 'a' }, { name: 'c' }
 *   - namespace: `import * as ns from 'x'`       → { name: 'ns' }
 *   - type-only: `import type { T } from 'x'`    → isType: true for all bindings
 *   - per-spec:  `import { type T, b } from 'x'` → T isType:true, b isType:false
 *   - side-effect-only `import 'x'` is ignored (no bindings).
 */
export function parseImports(file: string, source: string): ParsedImport[] {
  const lang = langForFile(file);
  if (!lang) return [];

  const root = parse(lang, source).root();
  const out: ParsedImport[] = [];

  for (const stmt of root.findAll({ rule: { kind: 'import_statement' } })) {
    const src = getField(stmt, 'source')?.text() ?? '';
    const sourceStr = src.replace(/^['"`]|['"`]$/g, '');
    const topTypeOnly = stmt.children().some((c) => c.kind() === 'type');

    for (const clause of childrenOfKind(stmt, 'import_clause')) {
      // Default binding: bare `identifier` direct child of import_clause.
      for (const c of clause.children()) {
        if (c.kind() === 'identifier') {
          out.push({ name: c.text(), source: sourceStr, isType: topTypeOnly });
        } else if (c.kind() === 'namespace_import') {
          const id = c.find({ rule: { kind: 'identifier' } });
          if (id) out.push({ name: id.text(), source: sourceStr, isType: topTypeOnly });
        } else if (c.kind() === 'named_imports') {
          for (const spec of childrenOfKind(c, 'import_specifier')) {
            const name = getField(spec, 'alias')?.text() ?? getField(spec, 'name')?.text();
            if (!name) continue;
            const specTypeOnly = spec.children().some((cc) => cc.kind() === 'type');
            out.push({ name, source: sourceStr, isType: topTypeOnly || specTypeOnly });
          }
        }
      }
    }
  }

  return out;
}
