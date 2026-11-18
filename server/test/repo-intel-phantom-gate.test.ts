/**
 * Phantom gate (plan 19 / P1-E, AC-39): only references that are truly
 * unresolved may surface — external libraries (`z`, `React`) never do.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import { referenceRowsFor } from '../src/modules/repo-intel/pipeline/index-rows.js';
import { build } from './graph-test-utils.js';

const SRC = [
  `import { z } from 'zod';`,
  `import React, { useState } from 'react';`,
  `export function view() {`,
  `  const s = z.object({});`,
  `  useState(0);`,
  `  React.createElement('div');`,
  `  return ghostCall();`,
  `}`,
].join('\n');

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'phantom-'));
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src/a.ts'), SRC);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('getUnresolvedReferences — phantom gate', () => {
  it('returns only the unresolved call; external libs never appear', async () => {
    const repo = {
      getRepoBasics: async () => ({ id: 'r1', owner: 'o', name: 'n', defaultBranch: 'main', clonePath: root }),
    };
    const svc = new RepoIntelService(repo as never, { repoIntelEnabled: true } as never);
    const out = await svc.getUnresolvedReferences('r1', ['src/a.ts']);
    expect(out.map((r) => r.symbolName)).toEqual(['ghostCall']);
    expect(out[0]!.declFile).toBeNull();
  });
});

describe('persisted references (decl_file IS NULL ⇒ unresolved, never external)', () => {
  it('writes no row for external libraries; keeps the unresolved bare call with decl_file NULL', () => {
    const { graph, modules } = build({ 'src/a.ts': SRC });
    const m = modules[0]!;
    const decls = graph.referencesDeclFile.filter((d) => d.file === 'src/a.ts');
    // the graph itself classifies z / React as external
    expect(decls.find((d) => d.name === 'useState')?.via).toBe('external');
    const rows = referenceRowsFor('r1', 'src/a.ts', 'h', m.facts, decls);
    const nullRows = rows.filter((r) => r.declFile === null).map((r) => r.toSymbol);
    expect(nullRows).toEqual(['ghostCall']);
    expect(rows.some((r) => ['z', 'React', 'object', 'createElement', 'useState'].includes(r.toSymbol))).toBe(false);
  });
});
