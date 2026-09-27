import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  collectConfigs,
  collectSamples,
  configDirs,
  headOfFile,
  isConfigFileName,
  numberLines,
  pickSubstantial,
  renderAlreadyDecided,
  renderSamples,
} from '../src/modules/conventions/sampler.js';
import { renderFacts } from '../src/modules/conventions/facts.js';
import type { ConventionFacts } from '../src/modules/repo-intel/types.js';

/**
 * Sample selection runs entirely in code, so it is testable without a model,
 * a database or a network — and it is the step that decides whether a scan can
 * produce anything at all.
 */

const COUNT_BY_CHARS = { count: (text: string) => Math.ceil(text.length / 4) };

describe('conventions sampler — config matching', () => {
  it('matches exact names and prefix patterns, ignoring case', () => {
    expect(isConfigFileName('package.json')).toBe(true);
    expect(isConfigFileName('tsconfig.json')).toBe(true);
    expect(isConfigFileName('tsconfig.build.json')).toBe(true);
    expect(isConfigFileName('.ESLintrc.cjs')).toBe(true);
    expect(isConfigFileName('eslint.config.mjs')).toBe(true);
    expect(isConfigFileName('.prettierrc')).toBe(true);
    expect(isConfigFileName('.editorconfig')).toBe(true);
  });

  it('does not match source files or lockfiles', () => {
    expect(isConfigFileName('service.ts')).toBe(false);
    expect(isConfigFileName('pnpm-lock.yaml')).toBe(false);
    expect(isConfigFileName('package-lock.json')).toBe(false);
  });
});

describe('conventions sampler — line numbering and truncation', () => {
  it('numbers every line, right-aligned to the widest number', () => {
    const text = Array.from({ length: 11 }, (_, i) => `line ${i + 1}`).join('\n');
    const lines = numberLines(text).split('\n');
    expect(lines[0]).toBe(' 1 | line 1');
    expect(lines[10]).toBe('11 | line 11');
  });

  it('keeps the head of an over-long file and says so', () => {
    const text = Array.from({ length: 400 }, (_, i) => `line ${i + 1}`).join('\n');
    const head = headOfFile(text, 250);
    expect(head.truncated).toBe(true);
    expect(head.lines).toBe(250);
    expect(head.text.split('\n').at(-1)).toBe('line 250');
  });

  it('leaves a short file alone', () => {
    const head = headOfFile('a\nb', 250);
    expect(head).toEqual({ text: 'a\nb', lines: 2, truncated: false });
  });
});

describe('conventions sampler — reading a clone', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'devdigest-conventions-'));
    // A monorepo whose ROOT carries no tooling — the shape this repository has,
    // and the one a root-only config search silently fails on.
    await writeFile(join(root, '.editorconfig'), 'indent_style = space\n');
    for (const pkg of ['server', 'client']) {
      await mkdir(join(root, pkg, 'src'), { recursive: true });
      await writeFile(join(root, pkg, 'package.json'), `{ "name": "${pkg}" }\n`);
      await writeFile(join(root, pkg, 'tsconfig.json'), '{ "strict": true }\n');
      await writeFile(
        join(root, pkg, 'src', 'index.ts'),
        'export const answer = 42;\nexport const other = 1;\n',
      );
    }
    await mkdir(join(root, 'node_modules', 'left-pad'), { recursive: true });
    await writeFile(join(root, 'node_modules', 'left-pad', 'package.json'), '{}');
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('finds first-level packages and skips node_modules', async () => {
    const dirs = await configDirs(root);
    expect(dirs).toContain('');
    expect(dirs).toContain('server');
    expect(dirs).toContain('client');
    expect(dirs).not.toContain('node_modules');
  });

  it('collects configs from the root AND from each package', async () => {
    const configs = await collectConfigs(root);
    const paths = configs.map((c) => c.path);
    expect(paths).toContain('.editorconfig');
    expect(paths).toContain('server/tsconfig.json');
    expect(paths).toContain('client/package.json');
  });

  it('reads ranked files and reports exactly what the model was shown', async () => {
    const set = await collectSamples({
      clonePath: root,
      rankedFiles: ['server/src/index.ts', 'client/src/index.ts', 'does/not/exist.ts'],
      tokenizer: COUNT_BY_CHARS,
    });
    expect(set.code.map((f) => f.path)).toEqual(['server/src/index.ts', 'client/src/index.ts']);
    // The allowlist the verifier checks against is configs + code, nothing else.
    expect(set.sampleFiles).toEqual([...set.configs.map((c) => c.path), ...set.code.map((c) => c.path)]);
    expect(set.tokens).toBeGreaterThan(0);
  });

  it('drops the lowest-ranked file first when the budget is blown', async () => {
    const greedy = { count: () => 1_000_000 };
    const set = await collectSamples({
      clonePath: root,
      rankedFiles: ['server/src/index.ts', 'client/src/index.ts'],
      tokenizer: greedy,
    });
    // One file always survives: an empty sample is a failed scan, not a small one.
    expect(set.code).toHaveLength(1);
    expect(set.code[0]!.path).toBe('server/src/index.ts');
  });
});

describe('conventions sampler — prompt sections', () => {
  const set = {
    configs: [{ path: 'server/tsconfig.json', text: '{ "strict": true }', lines: 1, truncated: false }],
    code: [{ path: 'src/a.ts', text: 'const a = 1;', lines: 1, truncated: false }],
    sampleFiles: ['server/tsconfig.json', 'src/a.ts'],
    tokens: 12,
  };

  it('wraps repo text as untrusted and numbers the code samples', () => {
    const rendered = renderSamples(set);
    expect(rendered).toContain('## Declared tooling');
    expect(rendered).toContain('<untrusted source="repo">');
    expect(rendered).toContain('1 | const a = 1;');
  });

  it('tells the model what was already decided, so a re-scan looks for new rules', () => {
    const section = renderAlreadyDecided(['Handlers return Result'], ['Use tabs']);
    expect(section).toContain('Accepted previously');
    expect(section).toContain('- Handlers return Result');
    expect(section).toContain('Rejected previously');
    expect(section).toContain('- Use tabs');
  });

  it('is empty on a first scan, so the prompt carries no dangling heading', () => {
    expect(renderAlreadyDecided([], [])).toBe('');
  });
});

describe('conventions sampler — choosing the twelve', () => {
  const file = (path: string, lines: number) => ({ path, text: 'x', lines, truncated: false });

  it('skips files too small to show a style, keeping the pool order', () => {
    // The first real scan spent two of its twelve slots on a 9-line barrel and
    // a 10-line helper.
    const picked = pickSubstantial(
      [file('barrel.ts', 9), file('a.ts', 80), file('helper.ts', 10), file('b.ts', 40), file('c.ts', 120)],
      3,
      20,
    );
    expect(picked.map((f) => f.path)).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  it('tops up with small files only when the pool runs short', () => {
    const picked = pickSubstantial([file('tiny.ts', 5), file('a.ts', 80), file('mini.ts', 8)], 3, 20);
    expect(picked.map((f) => f.path)).toEqual(['a.ts', 'tiny.ts', 'mini.ts']);
  });
});

describe('conventions facts — prompt section', () => {
  const facts: ConventionFacts = {
    filesIndexed: 311,
    edgesIndexed: 514,
    strataDepth: 1,
    strata: ['client', 'server'],
    recurringFileNames: [{ name: 'routes.ts', count: 8 }],
    naming: [{ scope: 'client *.tsx/jsx', total: 55, styles: { PascalCase: 42, 'single-word': 12, 'kebab-case': 1 } }],
    tests: [{ scope: 'server', total: 24, colocated: 0, separateDir: 24, suffixes: { '.test.ts': 18, '.it.test.ts': 6 } }],
    exportKinds: [{ scope: 'server', total: 202, kinds: { function: 85, interface: 59 } }],
    siblingImports: [{ from: 'routes.ts', to: 'service.ts', imports: 4 }],
    directoryImports: [{ from: 'client/src/app', to: 'client/src/lib', imports: 29 }],
  };

  it('states the scale, and that a count is not a citation', () => {
    const section = renderFacts(facts);
    expect(section).toContain('## Measured facts');
    expect(section).toContain('311 files, 514 import edges');
    expect(section).toContain('A count is not a citation');
    expect(section).toContain('<untrusted source="repo-index">');
  });

  it('renders each fact family, largest counts first', () => {
    const section = renderFacts(facts);
    expect(section).toContain('routes.ts ×8');
    expect(section).toContain('client *.tsx/jsx (55 files): PascalCase 42 · single-word 12 · kebab-case 1');
    expect(section).toContain('24 in a separate test folder, 0 beside the code');
    expect(section).toContain('routes.ts → service.ts ×4');
    expect(section).toContain('client/src/app → client/src/lib ×29');
  });

  it('says nothing for an unindexed repo rather than an empty heading', () => {
    expect(renderFacts(null)).toBe('');
    expect(renderFacts({ ...facts, degraded: true })).toBe('');
    expect(renderFacts({ ...facts, filesIndexed: 0 })).toBe('');
  });
});
