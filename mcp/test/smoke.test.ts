import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readRepoFile } from '../src/local.js';
import { Severity, Verdict, Review } from '@devdigest/shared';

/**
 * Smoke test for the MCP package (L04, §11). We deliberately do NOT import
 * `src/server.ts`: it calls `main()` at module load and connects a stdio
 * transport, which would hijack the test process's stdio. Instead we cover the
 * two pieces that actually carry logic and can run hermetically:
 *
 *   1. the local working-tree helpers (the `read_file` path-traversal guard), and
 *   2. the shared contract barrel the six tools serialize against.
 *
 * That's the typological surface: the tools are thin wrappers over these.
 */

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');

describe('mcp local helpers — readRepoFile', () => {
  it('reads a file inside the repo', () => {
    const pkg = readRepoFile('package.json', pkgRoot);
    expect(pkg).toContain('@devdigest/mcp');
  });

  it('refuses to read outside the repo root (path-traversal guard)', () => {
    expect(() => readRepoFile('../../../../etc/passwd', pkgRoot)).toThrow(
      /Refusing to read outside the repo/,
    );
  });
});

describe('mcp shared contracts barrel — @devdigest/shared', () => {
  it('exposes the enums the tools serialize against', () => {
    expect(Severity.options).toEqual(['CRITICAL', 'WARNING', 'SUGGESTION']);
    expect(Verdict.options).toEqual(['request_changes', 'approve', 'comment']);
  });

  it('validates a well-formed Review and rejects a malformed one', () => {
    const ok = Review.safeParse({
      verdict: 'approve',
      summary: 'no blocking issues',
      score: 100,
      findings: [],
    });
    expect(ok.success).toBe(true);

    // invalid verdict → schema rejects
    const bad = Review.safeParse({
      verdict: 'lgtm',
      summary: 'no blocking issues',
      score: 100,
      findings: [],
    });
    expect(bad.success).toBe(false);
  });
});
