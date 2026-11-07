import { describe, it, expect } from 'vitest';
import type { SmartDiffRole } from '@devdigest/shared';
import { classifyFile, classifyWith } from '../src/modules/smart-diff/classify.js';
import { SMART_DIFF_RULES, SMART_DIFF_GROUP_ORDER } from '../src/modules/smart-diff/constants.js';

const TABLE: [path: string, role: SmartDiffRole][] = [
  // boilerplate
  ['pnpm-lock.yaml', 'boilerplate'],
  ['client/pnpm-lock.yaml', 'boilerplate'],
  ['e2e/package-lock.json', 'boilerplate'], // beats e2e/**
  ['yarn.lock', 'boilerplate'],
  ['Cargo.lock', 'boilerplate'],
  ['dist/index.js', 'boilerplate'], // beats **/index.js
  ['packages/ui/build/main.js', 'boilerplate'],
  ['src/__snapshots__/App.test.tsx.snap', 'boilerplate'],
  ['src/foo.snap', 'boilerplate'],
  ['src/api.generated.ts', 'boilerplate'],
  ['public/vendor/jquery.min.js', 'boilerplate'],
  ['__tests__/__snapshots__/x.snap', 'boilerplate'], // disputed
  // tests
  ['server/test/contracts.test.ts', 'tests'],
  ['src/App.test.tsx', 'tests'],
  ['src/util.test.ts', 'tests'],
  ['server/src/foo.it.test.ts', 'tests'],
  ['src/foo.spec.ts', 'tests'],
  ['server/test/helpers/pg.ts', 'tests'],
  ['tests/fixtures/data.json', 'tests'],
  ['src/__tests__/util.ts', 'tests'],
  ['e2e/specs/05-pr-diff.flow.json', 'tests'],
  ['e2e/README.md', 'tests'], // disputed
  // wiring
  ['client/src/lib/hooks/index.ts', 'wiring'],
  ['index.js', 'wiring'],
  ['vitest.config.ts', 'wiring'],
  ['client/next.config.mjs', 'wiring'],
  ['tsconfig.json', 'wiring'],
  ['server/tsconfig.build.json', 'wiring'],
  ['.eslintrc.cjs', 'wiring'],
  ['.env.example', 'wiring'],
  ['docker-compose.yml', 'wiring'],
  ['docker-compose.test.yml', 'wiring'],
  ['.github/workflows/ci.yml', 'wiring'],
  ['.claude/skills/security/SKILL.md', 'wiring'], // disputed
  // docs
  ['README.md', 'docs'],
  ['server/docs/architecture.md', 'docs'],
  ['docs/diagram.png', 'docs'],
  ['client/README', 'docs'],
  ['CHANGELOG.txt', 'docs'],
  ['LICENSE', 'docs'],
  ['packages/x/LICENSE', 'docs'],
  // core (fallback)
  ['package.json', 'core'],
  ['server/src/db/migrations/0015_x.sql', 'core'],
  ['client/messages/en/prReview.json', 'core'],
  ['server/src/modules/smart-diff/classify.ts', 'core'],
  ['src/build.ts', 'core'], // not a build/ dir
  ['src/index.tsx', 'core'], // not a barrel pattern
  ['LICENSE.txt', 'core'], // exact LICENSE only
  ['src/Test/foo.ts', 'core'], // case-sensitive
];

describe('classifyFile', () => {
  it.each(TABLE)('%s → %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  it('rule order lives in SMART_DIFF_RULES', () => {
    expect(SMART_DIFF_RULES.map((r) => r.role)).toEqual(['boilerplate', 'tests', 'wiring', 'docs']);
    expect([...SMART_DIFF_GROUP_ORDER]).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    for (const [path] of TABLE) {
      expect(classifyFile(path)).toBe(classifyWith(path, SMART_DIFF_RULES));
    }
  });

  it('a reordered rule list flips the disputed cases', () => {
    const byRole = (role: SmartDiffRole) => {
      const rule = SMART_DIFF_RULES.find((r) => r.role === role);
      if (!rule) throw new Error(`missing rule ${role}`);
      return rule;
    };
    const rest = (...roles: SmartDiffRole[]) =>
      SMART_DIFF_RULES.filter((r) => !roles.includes(r.role));

    // docs ahead of wiring and tests (boilerplate still first)
    const docsFirst = [byRole('boilerplate'), byRole('docs'), ...rest('boilerplate', 'docs')];
    expect(classifyWith('.claude/skills/security/SKILL.md', docsFirst)).toBe('docs');
    expect(classifyWith('e2e/README.md', docsFirst)).toBe('docs');

    // tests ahead of boilerplate
    const testsFirst = [byRole('tests'), ...rest('tests')];
    expect(classifyWith('__tests__/__snapshots__/x.snap', testsFirst)).toBe('tests');
  });
});
