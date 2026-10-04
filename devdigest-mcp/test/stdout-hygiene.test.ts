// Static guard for the stdio invariant: nothing in src/ may write to stdout.
// Only log.ts (stderr) is allowed to talk about it, and only in a comment.
// Strategy: strip comments from every src file first, then fail on any remaining
// `console.log` / `process.stdout`. Comment stripping (instead of excluding log.ts)
// means log.ts is still checked for real code, while its explanatory comment
// ("Never use console.log or process.stdout") cannot cause a false failure.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return tsFiles(full);
    return e.name.endsWith('.ts') ? [full] : [];
  });
}

// Good enough for this codebase: drops /* ... */ and // ... (not inside "//" of URLs,
// which are preceded by ':'). A string literal containing the forbidden token would
// still be flagged, which is the safe direction.
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('stdout hygiene', () => {
  it('stripComments ignores comment mentions but keeps real code', () => {
    expect(stripComments('// console.log("x")\n/* process.stdout */')).not.toMatch(/console\.log|process\.stdout/);
    expect(stripComments('console.log("x")')).toContain('console.log');
    expect(stripComments('const u = "http://a"; process.stdout.write(u)')).toContain('process.stdout');
  });

  it('no src file uses console.log or process.stdout outside comments', () => {
    const files = tsFiles(SRC);
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.filter((f) =>
      /\bconsole\s*\.\s*log\b|\bprocess\s*\.\s*stdout\b/.test(stripComments(readFileSync(f, 'utf8'))),
    );
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });
});
