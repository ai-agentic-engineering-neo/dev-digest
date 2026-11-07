import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path, { join } from 'node:path';
import { DepCruiseGraph, toRel } from '../src/adapters/depgraph/index.js';

describe('depgraph toRel', () => {
  it('returns POSIX for win32 paths', () => {
    expect(toRel('C:\\work\\repo', 'C:\\work\\repo\\server\\src\\a.ts', path.win32)).toBe('server/src/a.ts');
  });

  it('returns POSIX for posix paths', () => {
    expect(toRel('/r', '/r/src/a.ts', path.posix)).toBe('src/a.ts');
  });
});

describe('DepCruiseGraph.buildEdges', () => {
  // Under cwd, not os.tmpdir(): cruise resolves against cwd and breaks on a different Windows drive.
  const dir = mkdtempSync(join(process.cwd(), '.depgraph-test-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('resolves a local import into a repo-relative POSIX edge', async () => {
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'a.ts'), "import { b } from './b';\nexport const a = b;\n");
    writeFileSync(join(dir, 'src', 'b.ts'), 'export const b = 1;\n');
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { module: 'esnext', moduleResolution: 'bundler' } }));
    const edges = await new DepCruiseGraph().buildEdges(dir, ['src/a.ts', 'src/b.ts']);
    expect(edges).toEqual([{ from: 'src/a.ts', to: 'src/b.ts' }]);
  });
});
