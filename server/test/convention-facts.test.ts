import { describe, it, expect } from 'vitest';
import {
  chooseStrataDepth,
  computeConventionFacts,
  interleaveByStratum,
  isTestPath,
  isToolingPath,
  namingStyleOf,
  stratumOf,
} from '../src/modules/repo-intel/pipeline/convention-facts.js';

/**
 * The index read behind a conventions scan. The first real scan of this repo
 * (rank order, no interleave) sampled seven server files, five client files and
 * nothing from the two smaller packages; these cases pin the fix and the counts
 * the scan now carries.
 */

const ranked = (paths: string[]) => paths.map((path, i) => ({ path, rank: paths.length - i }));

describe('strata', () => {
  it('splits a monorepo by top-level package', () => {
    expect(chooseStrataDepth(['server/src/a.ts', 'client/src/b.ts'])).toBe(1);
    expect(stratumOf('server/src/modules/x.ts', 1)).toBe('server');
  });

  it('splits a single-package repo one level deeper', () => {
    expect(chooseStrataDepth(['src/api/a.ts', 'src/lib/b.ts', 'README.ts'])).toBe(2);
    expect(stratumOf('src/api/users.ts', 2)).toBe('src/api');
  });

  it('puts root-level files in their own stratum', () => {
    expect(stratumOf('index.ts', 1)).toBe('.');
  });

  it('treats dot-folders as tooling and test folders as tests', () => {
    expect(isToolingPath('.claude/skills/x/scripts/a.ts')).toBe(true);
    expect(isToolingPath('server/src/a.ts')).toBe(false);
    expect(isTestPath('server/test/helpers/pg.ts')).toBe(true);
    expect(isTestPath('client/src/Foo/Foo.test.tsx')).toBe(true);
    expect(isTestPath('server/src/testing-utils.ts')).toBe(false);
  });
});

describe('interleaveByStratum', () => {
  const rows = ranked([
    'server/a.ts',
    'server/b.ts',
    'server/c.ts',
    'server/d.ts',
    'client/a.ts',
    'client/b.ts',
    'e2e/a.ts',
  ]);

  it('gives every stratum its best file before any stratum gets a second', () => {
    const out = interleaveByStratum(rows, 1).map((r) => r.path);
    expect(out.slice(0, 3).sort()).toEqual(['client/a.ts', 'e2e/a.ts', 'server/a.ts']);
  });

  it('keeps rank order inside each stratum', () => {
    const out = interleaveByStratum(rows, 1).map((r) => r.path);
    const server = out.filter((p) => p.startsWith('server/'));
    expect(server).toEqual(['server/a.ts', 'server/b.ts', 'server/c.ts', 'server/d.ts']);
  });

  it('gives the larger stratum the extra slots after the first round', () => {
    const out = interleaveByStratum(rows, 1).map((r) => r.path);
    // After one of each, 4 server files outweigh 2 client files.
    expect(out[3]).toBe('server/b.ts');
  });

  it('is a permutation of its input', () => {
    const out = interleaveByStratum(rows, 1);
    expect(out).toHaveLength(rows.length);
    expect(new Set(out.map((r) => r.path))).toEqual(new Set(rows.map((r) => r.path)));
  });

  it('caps the number of strata', () => {
    const many = ranked(Array.from({ length: 12 }, (_, i) => `pkg${i}/a.ts`));
    expect(interleaveByStratum(many, 1, 3)).toHaveLength(3);
  });
});

describe('namingStyleOf', () => {
  it('names the style of a file stem', () => {
    expect(namingStyleOf('run-executor')).toBe('kebab-case');
    expect(namingStyleOf('runExecutor')).toBe('camelCase');
    expect(namingStyleOf('FindingCard')).toBe('PascalCase');
    expect(namingStyleOf('find_card')).toBe('snake_case');
    expect(namingStyleOf('service')).toBe('single-word');
  });
});

describe('computeConventionFacts', () => {
  const paths = [
    'server/src/modules/a/routes.ts',
    'server/src/modules/a/service.ts',
    'server/src/modules/a/repository.ts',
    'server/src/modules/b/routes.ts',
    'server/src/modules/b/service.ts',
    'server/src/modules/b/repository.ts',
    'server/src/modules/c/routes.ts',
    'server/src/modules/c/service.ts',
    'server/src/modules/c/repository.ts',
    'server/src/platform/run-logger.ts',
    'server/src/platform/model-router.ts',
    'server/test/a.test.ts',
    'server/test/b.it.test.ts',
    'server/test/helpers/pg.ts',
    'client/src/Card/Card.tsx',
    'client/src/Card/Card.test.tsx',
    'client/src/Panel/Panel.tsx',
    'client/src/List/List.tsx',
    'client/src/Row/Row.tsx',
    'client/src/Menu/Menu.tsx',
    '.claude/skills/x/scripts/lib.ts',
  ];
  const edges = [
    { fromFile: 'server/src/modules/a/routes.ts', toFile: 'server/src/modules/a/service.ts' },
    { fromFile: 'server/src/modules/b/routes.ts', toFile: 'server/src/modules/b/service.ts' },
    { fromFile: 'server/src/modules/a/service.ts', toFile: 'server/src/modules/a/repository.ts' },
    { fromFile: 'server/src/modules/b/service.ts', toFile: 'server/src/modules/b/repository.ts' },
    { fromFile: 'server/src/modules/a/service.ts', toFile: 'server/src/platform/run-logger.ts' },
    { fromFile: 'server/src/modules/b/service.ts', toFile: 'server/src/platform/run-logger.ts' },
    // Tests import what they exercise; that says nothing about layering.
    { fromFile: 'server/test/a.test.ts', toFile: 'server/src/modules/a/service.ts' },
    { fromFile: 'server/test/b.it.test.ts', toFile: 'server/src/modules/b/service.ts' },
  ];
  const exportedSymbols = [
    { path: 'server/src/modules/a/service.ts', kind: 'class' },
    { path: 'server/src/modules/b/service.ts', kind: 'class' },
    { path: 'server/src/modules/c/service.ts', kind: 'class' },
    { path: 'server/src/modules/a/routes.ts', kind: 'function' },
    { path: 'server/src/modules/b/routes.ts', kind: 'function' },
    { path: 'server/src/modules/a/service.ts', kind: 'method' },
  ];
  const facts = computeConventionFacts({ paths, edges, exportedSymbols });

  it('counts the repo without its tooling folders', () => {
    expect(facts.filesIndexed).toBe(paths.length - 1);
    expect(facts.strata).toEqual(['server', 'client']);
  });

  it('finds the recurring file roles', () => {
    const names = Object.fromEntries(facts.recurringFileNames.map((r) => [r.name, r.count]));
    expect(names['routes.ts']).toBe(3);
    expect(names['service.ts']).toBe(3);
    expect(names['repository.ts']).toBe(3);
  });

  it('measures naming per package and per extension group', () => {
    const tsx = facts.naming.find((n) => n.scope === 'client *.tsx/jsx');
    expect(tsx?.styles.PascalCase).toBe(5);
  });

  it('tells separate-folder tests from colocated ones, counting only real test suffixes', () => {
    const server = facts.tests.find((t) => t.scope === 'server')!;
    expect(server).toMatchObject({ total: 3, separateDir: 3, colocated: 0 });
    // test/helpers/pg.ts is PLACED like a test but is not one — no `.ts` suffix row.
    expect(server.suffixes).toEqual({ '.test.ts': 1, '.it.test.ts': 1 });
    const client = facts.tests.find((t) => t.scope === 'client')!;
    expect(client).toMatchObject({ total: 1, colocated: 1 });
  });

  it('counts exported kinds without methods', () => {
    const server = facts.exportKinds.find((e) => e.scope === 'server')!;
    expect(server.kinds).toEqual({ class: 3, function: 2 });
  });

  it('shows the layering between sibling role files', () => {
    const pairs = facts.siblingImports.map((d) => `${d.from}→${d.to}×${d.imports}`);
    expect(pairs).toContain('routes.ts→service.ts×2');
    expect(pairs).toContain('service.ts→repository.ts×2');
  });

  it('shows directory dependencies from application code only', () => {
    const pairs = facts.directoryImports.map((d) => `${d.from}→${d.to}×${d.imports}`);
    expect(pairs).toContain('server/src/modules→server/src/platform×2');
    expect(pairs.some((p) => p.startsWith('server/test'))).toBe(false);
  });
});
