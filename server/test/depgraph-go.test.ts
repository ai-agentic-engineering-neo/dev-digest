import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GoDepGraph } from '../src/adapters/depgraph/go.js';
import { UnionDepGraph } from '../src/adapters/depgraph/union.js';
import type { DepGraph, FileEdge } from '../src/adapters/depgraph/index.js';

/**
 * Go import-graph builder (Phase 3, docs/go-language-support-plan.md) —
 * hermetic, no DB/Docker. Fixture is real files on disk (mkdtemp +
 * writeFile), matching this repo's existing convention (see
 * indexer-pipeline.test.ts) rather than a committed fixtures/ directory.
 */
describe('GoDepGraph', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'devdigest-go-depgraph-'));
    await mkdir(join(root, 'internal', 'util'), { recursive: true });
    await writeFile(root + '/go.mod', 'module example.com/greeter\n\ngo 1.22\n');
    await writeFile(
      join(root, 'main.go'),
      `package main

import (
	"fmt"
	"example.com/greeter/internal/util"
)

func main() {
	fmt.Println(util.Shout("hi"))
}
`,
    );
    await writeFile(
      join(root, 'internal', 'util', 'util.go'),
      `package util

func Shout(s string) string {
	return s + "!"
}
`,
    );
    await writeFile(
      join(root, 'internal', 'util', 'extra.go'),
      `package util

func Whisper(s string) string {
	return s
}
`,
    );
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  });

  const files = ['main.go', 'internal/util/util.go', 'internal/util/extra.go'];

  it('edges a local import to every file in the target package directory', async () => {
    const edges = await new GoDepGraph().buildEdges(root, files);
    expect(edges).toContainEqual({ from: 'main.go', to: 'internal/util/util.go' });
    expect(edges).toContainEqual({ from: 'main.go', to: 'internal/util/extra.go' });
  });

  it('does not edge the stdlib import ("fmt")', async () => {
    const edges = await new GoDepGraph().buildEdges(root, files);
    expect(edges.some((e) => e.to === 'fmt' || e.from === 'fmt')).toBe(false);
  });

  it('does not edge a package to itself', async () => {
    const edges = await new GoDepGraph().buildEdges(root, files);
    expect(edges.some((e) => e.from === e.to)).toBe(false);
  });

  it('returns [] when there are no Go files in the given set', async () => {
    const edges = await new GoDepGraph().buildEdges(root, ['README.md']);
    expect(edges).toEqual([]);
  });

  it('returns [] when go.mod is missing', async () => {
    const noModRoot = await mkdtemp(join(tmpdir(), 'devdigest-go-depgraph-nomod-'));
    try {
      await writeFile(join(noModRoot, 'main.go'), 'package main\n\nfunc main() {}\n');
      const edges = await new GoDepGraph().buildEdges(noModRoot, ['main.go']);
      expect(edges).toEqual([]);
    } finally {
      await rm(noModRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});

describe('UnionDepGraph', () => {
  it('concatenates edges from every composed builder', async () => {
    const a: DepGraph = { buildEdges: async () => [{ from: 'a.ts', to: 'b.ts' }] };
    const b: DepGraph = { buildEdges: async () => [{ from: 'x.go', to: 'y.go' }] };
    const union = new UnionDepGraph([a, b]);
    const edges = await union.buildEdges('/repo', ['a.ts', 'b.ts', 'x.go', 'y.go']);
    expect(edges).toEqual<FileEdge[]>([
      { from: 'a.ts', to: 'b.ts' },
      { from: 'x.go', to: 'y.go' },
    ]);
  });

  it('defaults to DepCruiseGraph + GoDepGraph when constructed with no args', async () => {
    const union = new UnionDepGraph();
    const edges = await union.buildEdges('/nonexistent-root', ['a.ts', 'a.go']);
    expect(edges).toEqual([]);
  });
});
