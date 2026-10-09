import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectStack } from '../src/modules/onboarding/stack.js';
import { collectSetupCandidates, scanServiceNames } from '../src/modules/onboarding/setup.js';

/**
 * specs/10-onboarding-generator.md — AC-2 (stack detection), AC-4 (setup
 * candidates). Every read is containment-checked and lockfiles are detected
 * by FILENAME ONLY (never read) — verified with a lockfile whose CONTENTS
 * would fail JSON/text parsing if it were ever read.
 */

let dir: string | undefined;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

async function withClone(files: Record<string, string>): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'onboarding-stack-'));
  for (const [path, content] of Object.entries(files)) {
    const full = join(d, path);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content);
  }
  dir = d;
  return d;
}

describe('detectStack', () => {
  it('detects language/runtime/package-manager/frameworks with evidence files (AC-2)', async () => {
    const clonePath = await withClone({
      'package.json': JSON.stringify({
        engines: { node: '>=22' },
        dependencies: { next: '15.0.0', react: '19.0.0' },
        devDependencies: { fastify: '5.0.0' },
      }),
      'tsconfig.json': '{}',
      'pnpm-lock.yaml': 'not valid json at all — must never be read',
    });

    const stack = await detectStack(clonePath);

    expect(stack.language).toEqual({ value: 'TypeScript', evidenceFile: 'tsconfig.json' });
    expect(stack.runtime).toEqual({ value: 'node >=22', evidenceFile: 'package.json' });
    expect(stack.packageManager).toEqual({ value: 'pnpm', evidenceFile: 'pnpm-lock.yaml' });
    expect(stack.frameworks).toEqual(
      expect.arrayContaining([
        { value: 'Next.js', evidenceFile: 'package.json' },
        { value: 'React', evidenceFile: 'package.json' },
        { value: 'Fastify', evidenceFile: 'package.json' },
      ]),
    );
  });

  it('a declared `packageManager` field wins over any lockfile', async () => {
    const clonePath = await withClone({
      'package.json': JSON.stringify({ packageManager: 'pnpm@9.1.0' }),
      'package-lock.json': '{}',
    });
    const stack = await detectStack(clonePath);
    expect(stack.packageManager).toEqual({ value: 'pnpm', evidenceFile: 'package.json' });
  });

  it('degrades to JavaScript + no package manager when there is no tsconfig/lockfile', async () => {
    const clonePath = await withClone({ 'package.json': '{}' });
    const stack = await detectStack(clonePath);
    expect(stack.language).toEqual({ value: 'JavaScript', evidenceFile: 'package.json' });
    expect(stack.packageManager).toBeUndefined();
  });

  it('returns an empty StackFacts (never throws) with no package.json at all', async () => {
    const clonePath = await withClone({ 'README.md': '# hi' });
    const stack = await detectStack(clonePath);
    expect(stack).toEqual({ frameworks: [] });
  });

  it('never escapes containment via a symlinked package.json', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'onboarding-stack-outside-'));
    try {
      await writeFile(join(outside, 'secret.json'), JSON.stringify({ dependencies: { next: '1' } }));
      const clonePath = await withClone({});
      await symlink(join(outside, 'secret.json'), join(clonePath, 'package.json'));
      const stack = await detectStack(clonePath);
      expect(stack).toEqual({ frameworks: [] }); // containment refused → degrades cleanly
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe('collectSetupCandidates', () => {
  it('collects script/env/compose candidates with evidence files (AC-4)', async () => {
    const clonePath = await withClone({
      'package.json': JSON.stringify({ scripts: { dev: 'next dev', install: 'pnpm install' } }),
      '.env.example': 'API_KEY=',
      'docker-compose.yml': 'services:\n  db:\n    image: postgres\n  redis:\n    image: redis\n',
    });

    const candidates = await collectSetupCandidates(clonePath);

    expect(candidates).toEqual(
      expect.arrayContaining([
        { command: 'next dev', kind: 'script', evidenceFile: 'package.json' },
        { command: 'pnpm install', kind: 'script', evidenceFile: 'package.json' },
        { command: 'cp .env.example .env', kind: 'env', evidenceFile: '.env.example' },
        { command: 'docker compose up -d', kind: 'compose', evidenceFile: 'docker-compose.yml' },
      ]),
    );
  });

  it('yields exactly the scripts declared, nothing invented, with no compose/env candidates when absent', async () => {
    const clonePath = await withClone({
      'package.json': JSON.stringify({ scripts: { test: 'vitest run' } }),
    });
    const candidates = await collectSetupCandidates(clonePath);
    expect(candidates).toEqual([{ command: 'vitest run', kind: 'script', evidenceFile: 'package.json' }]);
  });

  it('scanServiceNames reads only top-level `services:` keys — no YAML parse, no value interpolation', () => {
    const compose = [
      'version: "3"',
      'services:',
      '  api:',
      '    image: node',
      '  db:',
      '    image: postgres',
      'volumes:',
      '  data:',
    ].join('\n');
    expect(scanServiceNames(compose)).toEqual(['api', 'db']);
    expect(scanServiceNames('version: "3"\nvolumes:\n  data:\n')).toEqual([]);
  });
});
