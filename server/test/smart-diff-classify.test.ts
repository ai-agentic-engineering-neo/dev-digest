import { describe, it, expect } from 'vitest';
import type { SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from '../src/modules/smart-diff/index.js';

/**
 * Path → role table (server/specs/06-smart-diff.md, "Classification").
 * ROLE_CHECK_ORDER (boilerplate, tests, wiring, docs; else core) decides ties
 * — the three contested cases below pin that decision.
 */
const CASES: Array<[string, SmartDiffRole, string]> = [
  // boilerplate
  ['pnpm-lock.yaml', 'boilerplate', 'named lockfile'],
  ['client/pnpm-lock.yaml', 'boilerplate', 'named lockfile, nested'],
  ['yarn.lock', 'boilerplate', 'named lockfile'],
  ['packages/app/package-lock.json', 'boilerplate', 'named lockfile, nested'],
  ['server/foo.lock', 'boilerplate', '*.lock basename'],
  ['dist/index.js', 'boilerplate', 'dist/** root-anchored'],
  ['build/main.js', 'boilerplate', 'build/** root-anchored'],
  ['schema.generated.ts', 'boilerplate', '*.generated.* basename'],
  ['vendor/lib.min.js', 'boilerplate', '*.min.js basename'],
  // tests
  ['src/foo.test.ts', 'tests', '*.test.ts basename'],
  ['client/src/Foo.test.tsx', 'tests', '*.test.tsx basename'],
  ['server/test/smart-diff.it.test.ts', 'tests', '*.it.test.ts basename'],
  ['server/test/helpers/pg.ts', 'tests', '**/test/** any depth'],
  ['client/src/__tests__/foo.ts', 'tests', '**/__tests__/** any depth'],
  ['e2e/flows/05-review.flow.json', 'tests', 'e2e/** root-anchored'],
  // wiring
  ['src/api/index.ts', 'wiring', 'index.ts basename'],
  ['client/vite.config.ts', 'wiring', '*.config.* basename'],
  ['tsconfig.base.json', 'wiring', 'tsconfig*.json basename'],
  ['.env.local', 'wiring', '.env* basename'],
  ['.github/workflows/ci.yml', 'wiring', '.github/** root-anchored'],
  // docs
  ['README.md', 'docs', 'README* basename'],
  ['docs/onion-migration.md', 'docs', 'docs/** root-anchored'],
  ['CHANGELOG.md', 'docs', 'CHANGELOG* basename'],
  ['LICENSE', 'docs', 'literal LICENSE'],
  // core (default, and the boundary of the root-anchor rule)
  ['src/config.ts', 'core', 'no pattern matches'],
  ['src/api/index.ts'.replace('index.ts', 'handlers.ts'), 'core', 'not a barrel file'],
  ['client/dist/x.js', 'core', 'dist/** is root-anchored, this is nested'],
  // contested cases (server/specs/06-smart-diff.md brief)
  ['__tests__/__snapshots__/x.snap', 'boilerplate', 'contested: boilerplate checked before tests'],
  ['.claude/skills/security/SKILL.md', 'wiring', 'contested: wiring checked before docs'],
  ['e2e/README.md', 'tests', 'contested: tests (e2e/**) checked before docs (README*)'],
];

describe('classifyFile', () => {
  it.each(CASES)('%s -> %s (%s)', (path, expected) => {
    expect(classifyFile(path)).toBe(expected);
  });

  it('normalises a leading "./" and backslashes', () => {
    expect(classifyFile('./src/foo.test.ts')).toBe('tests');
    expect(classifyFile('src\\foo.test.ts')).toBe('tests');
  });
});
